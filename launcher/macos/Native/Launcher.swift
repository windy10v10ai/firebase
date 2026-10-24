// GPL-3.0.
import Cocoa

private let arguments = CommandLine.arguments
private let preview = arguments.contains("--preview")
private func option(_ name: String) -> String? {
    guard let index = arguments.firstIndex(of: name), index + 1 < arguments.count else { return nil }
    return arguments[index + 1].hasPrefix("--") ? nil : arguments[index + 1]
}
private let languageCode: String = {
    let language = option("--preview") ?? Locale.preferredLanguages.first ?? "en"
    if language.hasPrefix("zh") { return "zh-CN" }
    if ["ru", "uk", "be", "kk"].contains(String(language.prefix(2))) { return "ru-RU" }
    return "en-US"
}()
private let sharedStrings: [String: String] = {
    guard let url = Bundle.main.url(forResource: "strings-" + languageCode, withExtension: "json"),
          let data = try? Data(contentsOf: url),
          let values = try? JSONSerialization.jsonObject(with: data) as? [String: String] else { return [:] }
    return values
}()
private func text(_ key: String, _ values: String...) -> String {
    var value = sharedStrings[key] ?? key
    for (index, replacement) in values.enumerated() { value = value.replacingOccurrences(of: "{\(index)}", with: replacement) }
    return value
}
private var launcherVersion: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "" }

private enum Theme {
    static func color(_ hex: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
    }
    static let background = color(0x161412)
    static let panel = color(0x211d1a)
    static let border = color(0x3b3029)
    static let accent = color(0xe0552d)
    static let text = color(0xeee7e0)
    static let muted = color(0xaca198)
}

private final class ContentStack: NSStackView {
    override var isFlipped: Bool { true }
}

private final class Banner: NSView {
    let image = Bundle.main.url(forResource: "banner", withExtension: "jpg").flatMap { NSImage(contentsOf: $0) }
    override func draw(_ dirtyRect: NSRect) {
        NSBezierPath(rect: bounds).addClip()
        NSColor.black.setFill(); bounds.fill()
        guard let image = image else { return }
        let width = bounds.width * 0.8
        let height = width * image.size.height / image.size.width
        image.draw(in: NSRect(x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width: width, height: height), from: .zero, operation: .sourceOver, fraction: 1)
    }
}

private final class DifficultyButton: NSButton {
    var subtitle = ""
    override var isFlipped: Bool { true }
    override var alignmentRectInsets: NSEdgeInsets { NSEdgeInsetsZero }
    override func draw(_ dirtyRect: NSRect) {
        let shape = NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 8, yRadius: 8)
        (isHighlighted ? Theme.border : Theme.panel).setFill(); shape.fill()
        (window?.firstResponder === self ? Theme.accent : Theme.border).setStroke(); shape.stroke()
        let opacity: CGFloat = isEnabled ? 1 : 0.4
        let icon = NSRect(x: (bounds.width - 26) / 2, y: 10, width: 26, height: 26)
        Theme.accent.withAlphaComponent(opacity).setFill(); NSBezierPath(ovalIn: icon).fill()
        let arrow = NSBezierPath(); arrow.move(to: NSPoint(x: icon.midX - 3, y: icon.midY - 6))
        arrow.line(to: NSPoint(x: icon.midX + 6, y: icon.midY)); arrow.line(to: NSPoint(x: icon.midX - 3, y: icon.midY + 6)); arrow.close()
        NSColor.white.withAlphaComponent(opacity).setFill(); arrow.fill()
        let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center
        (title as NSString).draw(in: NSRect(x: 6, y: 40, width: bounds.width - 12, height: 24), withAttributes: [.font: NSFont.systemFont(ofSize: 17, weight: .semibold), .foregroundColor: Theme.text.withAlphaComponent(opacity), .paragraphStyle: paragraph])
        (subtitle as NSString).draw(in: NSRect(x: 6, y: 64, width: bounds.width - 12, height: 18), withAttributes: [.font: NSFont.systemFont(ofSize: 11), .foregroundColor: Theme.muted.withAlphaComponent(opacity), .paragraphStyle: paragraph])
    }
}

final class Launcher: NSObject, NSApplicationDelegate, NSTableViewDataSource, NSTableViewDelegate, NSTextViewDelegate {
    var window: NSWindow!
    var engine: Process?
    var input: Pipe?
    var pending = Data()
    var closing = false
    var backendAvailable = true
    var state = "idle"
    var sessionRole = "solo"
    var code = ""
    var mapState = "checking"
    var mapMessage = ""
    var paused = false
    var pendingStart = false
    var releaseAvailable = false
    var avatarCache = [String: NSImage]()
    var avatarRequests = Set<String>()
    var roomRows = [[String: Any]]()
    var playerRows = [[String: Any]]()
    var feedbackWindow: NSWindow?
    var feedbackType: NSSegmentedControl?
    var feedbackDescription: NSTextView?
    var feedbackLog: NSButton?
    var feedbackTopics = [NSButton]()
    var feedbackSend: NSButton?
    let defaults = UserDefaults.standard
    let pages = NSSegmentedControl(labels: [text("Solo"), text("HostRoom"), text("JoinRoom")], trackingMode: .selectOne, target: nil, action: nil)
    let roomType = NSSegmentedControl(labels: [text("PublicRoom"), text("PrivateRoom")], trackingMode: .selectOne, target: nil, action: nil)
    let count = NSPopUpButton()
    let autoStart = NSButton(checkboxWithTitle: text("AutoStartDota"), target: nil, action: nil)
    let autoEnter = NSButton(checkboxWithTitle: text("AutoEnter"), target: nil, action: nil)
    let testMap = NSButton(checkboxWithTitle: text("UseTestMap"), target: nil, action: nil)
    let roomCode = NSTextField()
    let roomLabel = NSTextField(labelWithString: "")
    let status = NSTextField(wrappingLabelWithString: text("Idle"))
    let route = NSTextField(wrappingLabelWithString: "")
    let hint = NSTextField(wrappingLabelWithString: "")
    let mapLabel = NSTextField(wrappingLabelWithString: text("MapChecking"))
    let notice = NSTextField(wrappingLabelWithString: "")
    let progress = NSProgressIndicator()
    let enter = NSButton(title: text("EnterGame"), target: nil, action: nil)
    let stop = NSButton(title: text("StopServer"), target: nil, action: nil)
    let copyCode = NSButton(title: text("Copy"), target: nil, action: nil)
    let removePlayer = NSButton(title: text("Kick"), target: nil, action: nil)
    let reopen = NSButton(title: text("Reopen"), target: nil, action: nil)
    let installUpdate = NSButton(title: text("Update"), target: nil, action: nil)
    let refresh = NSButton(title: text("Refresh"), target: nil, action: nil)
    let joinSelected = NSButton(title: text("JoinSelectedRoom"), target: nil, action: nil)
    let updateMap = NSButton(title: text("UpdateMap"), target: nil, action: nil)
    let verify = NSButton(title: text("VerifyFiles"), target: nil, action: nil)
    let subscribe = NSButton(title: text("Subscribe"), target: nil, action: nil)
    let download = NSButton(title: text("OpenDownloadPage"), target: nil, action: nil)
    let rooms = NSTableView()
    let players = NSTableView()
    let journal = NSTextView()
    var statusLine: NSStackView!
    var roomSettings: NSStackView!
    var difficultyRow: NSStackView!
    var difficulties = [NSButton]()
    var browser: NSStackView!
    var roster: NSStackView!
    var joinLine: NSStackView!
    var gameActions: NSStackView!
    var codeLine: NSStackView!
    var mapActions: NSStackView!
    var mapCard: NSStackView!
    let mapWarning = NSTextField(wrappingLabelWithString: "")

    var page: String { ["solo", "host", "join"][max(0, pages.selectedSegment)] }
    var active: Bool { !["idle", "error"].contains(state) }
    var busy: Bool { ["checking", "opening", "loading", "joining", "stopping", "saving", "updating", "updating-launcher"].contains(state) }
    var away: Bool { active && sessionRole == "host" && page == "join" }
    var browsing: Bool { page == "join" && (!active || away) }

    func label(_ value: String, size: CGFloat = 13, weight: NSFont.Weight = .regular) -> NSTextField {
        let view = NSTextField(labelWithString: value)
        view.font = .systemFont(ofSize: size, weight: weight)
        view.textColor = Theme.text
        return view
    }
    func stack(_ views: [NSView], horizontal: Bool = false, spacing: CGFloat = 10) -> NSStackView {
        let view = NSStackView(views: views)
        view.orientation = horizontal ? .horizontal : .vertical
        view.alignment = horizontal ? .centerY : .leading
        view.spacing = spacing
        if !horizontal { for child in views { child.widthAnchor.constraint(equalTo: view.widthAnchor).isActive = true } }
        return view
    }
    func spacer() -> NSView {
        let view = NSView()
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return view
    }
    func action(_ button: NSButton, _ selector: Selector) {
        button.target = self; button.action = selector; button.bezelStyle = .rounded; button.contentTintColor = Theme.text
    }
    func button(_ title: String, _ selector: Selector) -> NSButton {
        let view = NSButton(title: title, target: self, action: selector)
        view.bezelStyle = .rounded; view.contentTintColor = Theme.text
        return view
    }
    func table(_ table: NSTableView, columns: [(String, String, CGFloat)], height: CGFloat) -> NSScrollView {
        for (identifier, title, width) in columns {
            let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier(identifier))
            column.title = title; column.width = width; column.minWidth = 50
            table.addTableColumn(column)
        }
        table.delegate = self; table.dataSource = self; table.rowHeight = 34
        table.usesAlternatingRowBackgroundColors = false
        table.backgroundColor = Theme.panel
        table.gridColor = Theme.border
        table.selectionHighlightStyle = .regular
        table.columnAutoresizingStyle = .lastColumnOnlyAutoresizingStyle
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true; scroll.borderType = .noBorder; scroll.documentView = table
        scroll.wantsLayer = true; scroll.layer?.cornerRadius = 8
        scroll.heightAnchor.constraint(equalToConstant: height).isActive = true
        return scroll
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.appearance = NSAppearance(named: .darkAqua)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 680, height: 690), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = text("Title"); window.minSize = NSSize(width: 680, height: 620); window.center()
        window.backgroundColor = Theme.background
        let content = window.contentView!
        content.wantsLayer = true; content.layer?.backgroundColor = Theme.background.cgColor
        let banner = Banner(); banner.translatesAutoresizingMaskIntoConstraints = false
        let scroll = NSScrollView(); scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.hasVerticalScroller = true; scroll.drawsBackground = false
        content.addSubview(banner); content.addSubview(scroll)
        NSLayoutConstraint.activate([
            banner.leadingAnchor.constraint(equalTo: content.leadingAnchor), banner.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            banner.topAnchor.constraint(equalTo: content.topAnchor), banner.heightAnchor.constraint(equalToConstant: 112),
            scroll.topAnchor.constraint(equalTo: banner.bottomAnchor), scroll.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: content.trailingAnchor), scroll.bottomAnchor.constraint(equalTo: content.bottomAnchor)
        ])
        let root = ContentStack(); root.orientation = .vertical; root.alignment = .leading; root.spacing = 12
        root.edgeInsets = NSEdgeInsets(top: 16, left: 24, bottom: 20, right: 24)
        root.translatesAutoresizingMaskIntoConstraints = false
        scroll.documentView = root
        root.widthAnchor.constraint(equalTo: scroll.contentView.widthAnchor).isActive = true
        root.heightAnchor.constraint(greaterThanOrEqualTo: scroll.contentView.heightAnchor).isActive = true
        let version = button("v" + launcherVersion + " ↗", #selector(openChangelog)); version.toolTip = text("Changelog")
        let subtitle = NSTextField(wrappingLabelWithString: text("Subtitle")); subtitle.textColor = Theme.muted
        subtitle.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        root.addArrangedSubview(stack([subtitle, spacer(), version], horizontal: true))
        pages.segmentDistribution = .fillEqually; pages.controlSize = .large
        pages.selectedSegmentBezelColor = Theme.accent
        pages.selectedSegment = preview ? 0 : min(2, max(0, defaults.integer(forKey: "mode")))
        pages.target = self; pages.action = #selector(changePage); root.addArrangedSubview(pages)
        roomType.selectedSegment = preview ? 0 : (defaults.bool(forKey: "privateRoom") ? 1 : 0)
        roomType.target = self; roomType.action = #selector(saveSettings)
        count.addItems(withTitles: (2...10).map { text("PlayersOption", String($0)) })
        let savedCount = defaults.integer(forKey: "maxPlayers")
        count.selectItem(at: preview || !(2...10).contains(savedCount) ? 8 : savedCount - 2)
        count.target = self; count.action = #selector(saveSettings)
        roomSettings = stack([label(text("RoomType")), roomType, spacer(), label(text("MaxPlayers")), count], horizontal: true)
        root.addArrangedSubview(roomSettings)
        mapWarning.maximumNumberOfLines = 4
        mapCard = stack([label(text("MapCardTitle"), weight: .semibold), mapWarning])
        root.addArrangedSubview(mapCard)
        difficultyRow = stack([], horizontal: true)
        for (index, key) in ["Easy", "Hard", "Custom"].enumerated() {
            let difficulty = DifficultyButton(title: text(key), target: self, action: #selector(startGame(_:)))
            difficulty.subtitle = ["N1 ~ N5", "N6 ~ N8", text("CustomSub")][index]
            difficulty.setAccessibilityHelp(difficulty.subtitle)
            difficulty.tag = index; difficulty.font = .systemFont(ofSize: 17, weight: .semibold)
            difficulty.heightAnchor.constraint(equalToConstant: 88).isActive = true
            difficultyRow.addArrangedSubview(difficulty); difficulties.append(difficulty)
        }
        difficultyRow.distribution = .fillEqually
        root.addArrangedSubview(difficultyRow)
        autoStart.state = preview || defaults.object(forKey: "autoStartDota") == nil || defaults.bool(forKey: "autoStartDota") ? .on : .off
        autoEnter.state = preview || defaults.object(forKey: "autoEnter") == nil || defaults.bool(forKey: "autoEnter") ? .on : .off
        autoStart.target = self; autoStart.action = #selector(saveSettings)
        autoEnter.target = self; autoEnter.action = #selector(autoEnterChanged)
        root.addArrangedSubview(autoStart); root.addArrangedSubview(autoEnter)
        action(refresh, #selector(refreshRooms)); action(joinSelected, #selector(joinRoom))
        rooms.target = self; rooms.doubleAction = #selector(joinRoom)
        browser = stack([
            stack([label(text("PublicRooms"), weight: .semibold), spacer(), refresh], horizontal: true),
            table(rooms, columns: [("name", text("TagHost"), 200), ("map", text("ColumnMap"), 90), ("players", text("ColumnPlayers"), 80), ("ping", text("ColumnPing"), 180)], height: 160),
            joinSelected
        ])
        root.addArrangedSubview(browser)
        roomCode.placeholderString = text("CodeExample"); roomCode.font = .monospacedSystemFont(ofSize: 14, weight: .medium)
        roomCode.target = self; roomCode.action = #selector(joinByCode)
        roomCode.setContentHuggingPriority(.defaultLow, for: .horizontal)
        joinLine = stack([roomCode, button(text("Paste"), #selector(pasteCode)), button(text("Join"), #selector(joinByCode))], horizontal: true)
        root.addArrangedSubview(joinLine)
        action(removePlayer, #selector(kickPlayer))
        roster = stack([
            stack([label(text("PlayersInRoom"), weight: .semibold), spacer(), removePlayer], horizontal: true),
            table(players, columns: [("name", text("Player"), 300), ("status", text("StatusColumn"), 260)], height: 140)
        ])
        root.addArrangedSubview(roster)
        roomLabel.font = .monospacedSystemFont(ofSize: 25, weight: .semibold); roomLabel.isSelectable = true
        action(copyCode, #selector(copyRoom))
        codeLine = stack([label(text("RoomCode")), roomLabel, spacer(), copyCode], horizontal: true); root.addArrangedSubview(codeLine)
        status.font = .systemFont(ofSize: 14, weight: .medium); status.maximumNumberOfLines = 3
        progress.style = .spinning; progress.controlSize = .small; progress.isDisplayedWhenStopped = false
        statusLine = stack([progress, status], horizontal: true); root.addArrangedSubview(statusLine)
        route.textColor = Theme.muted; root.addArrangedSubview(route)
        hint.textColor = Theme.muted; hint.maximumNumberOfLines = 3; root.addArrangedSubview(hint)
        action(enter, #selector(enterGame)); action(stop, #selector(stopGame))
        gameActions = stack([enter, stop, button(text("CopyCommand"), #selector(copyConnect))], horizontal: true)
        root.addArrangedSubview(gameActions)
        action(reopen, #selector(reopenRoom)); root.addArrangedSubview(reopen); reopen.isHidden = true
        let breathingRoom = NSView(); breathingRoom.heightAnchor.constraint(greaterThanOrEqualToConstant: 12).isActive = true
        breathingRoom.setContentHuggingPriority(.defaultLow, for: .vertical); root.addArrangedSubview(breathingRoom)
        let divider = NSBox(); divider.boxType = .separator; root.addArrangedSubview(divider)
        mapLabel.maximumNumberOfLines = 2; root.addArrangedSubview(mapLabel)
        action(updateMap, #selector(updateWorkshop)); action(verify, #selector(verifyFiles)); action(subscribe, #selector(subscribeMap))
        mapActions = stack([updateMap, verify, subscribe, spacer()], horizontal: true); root.addArrangedSubview(mapActions)
        notice.maximumNumberOfLines = 3; root.addArrangedSubview(notice)
        action(download, #selector(openDownload)); action(installUpdate, #selector(updateLauncher))
        root.addArrangedSubview(stack([installUpdate, download, spacer()], horizontal: true)); download.isHidden = true; installUpdate.isHidden = true
        let developer = button(text("Developer"), #selector(toggleDeveloper))
        let feedback = button(text("Feedback"), #selector(showFeedback))
        testMap.state = preview ? .off : (defaults.bool(forKey: "testMap") ? .on : .off)
        testMap.isHidden = true; testMap.target = self; testMap.action = #selector(testMapChanged)
        root.addArrangedSubview(stack([feedback, spacer(), developer], horizontal: true))
        root.addArrangedSubview(testMap)
        let logs = button(text("OpenLogs"), #selector(openLogs)); let logToggle = button(text("Logs"), #selector(toggleLogs))
        root.addArrangedSubview(stack([logs, logToggle, spacer(), button(text("VersionCheck"), #selector(checkVersion))], horizontal: true))
        let logScroll = NSScrollView(); logScroll.hasVerticalScroller = true; logScroll.borderType = .bezelBorder
        journal.isEditable = false; journal.isSelectable = true; journal.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        journal.textContainerInset = NSSize(width: 8, height: 8); journal.autoresizingMask = [.width]
        journal.isVerticallyResizable = true; journal.textContainer?.widthTracksTextView = true
        logScroll.documentView = journal; logScroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 70).isActive = true
        root.addArrangedSubview(logScroll); logScroll.isHidden = true
        for view in root.arrangedSubviews { view.widthAnchor.constraint(equalTo: root.widthAnchor, constant: -48).isActive = true }
        buildMenu(); refreshControls()
        if option("--screenshot") == nil { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
        if preview {
            previewState()
            if let path = option("--screenshot") {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.savePreview(path) }
            }
        } else { launchEngine() }
    }
    func buildMenu() {
        let menu = NSMenu(); let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: text("About"), action: #selector(about), keyEquivalent: "")
        appMenu.addItem(.separator()); appMenu.addItem(withTitle: text("Quit"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let editItem = NSMenuItem(); editItem.title = text("Edit"); menu.addItem(editItem)
        let edit = NSMenu(title: text("Edit")); editItem.submenu = edit
        edit.addItem(withTitle: text("Cut"), action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: text("Copy"), action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: text("Paste"), action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: text("SelectAll"), action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        NSApp.mainMenu = menu
    }
    func launchEngine() {
        let process = Process(); process.executableURL = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/engine/WindyMacEngine")
        process.arguments = ["--language", languageCode]
        let writer = Pipe(), output = Pipe(), error = Pipe(); input = writer
        process.standardInput = writer; process.standardOutput = output; process.standardError = error
        output.fileHandleForReading.readabilityHandler = { [weak self] file in
            let data = file.availableData; if !data.isEmpty { DispatchQueue.main.async { self?.consume(data) } }
        }
        error.fileHandleForReading.readabilityHandler = { [weak self] file in
            let data = file.availableData
            if let value = String(data: data, encoding: .utf8), !value.isEmpty { DispatchQueue.main.async { self?.append(value) } }
        }
        process.terminationHandler = { [weak self] _ in DispatchQueue.main.async {
            guard let self = self else { return }
            if self.closing { NSApp.reply(toApplicationShouldTerminate: true) }
            else { self.backendAvailable = false; self.state = "error"; self.status.stringValue = text("BackendExited"); self.refreshControls() }
        } }
        engine = process
        do {
            try process.run(); inspect(); checkVersion(); updateBrowsing()
        } catch { backendAvailable = false; state = "error"; status.stringValue = text("BackendStartFailed", error.localizedDescription); refreshControls() }
    }
    func send(_ values: [String: Any]) {
        guard !preview else { return }
        do {
            var data = try JSONSerialization.data(withJSONObject: values); data.append(0x0a)
            try input?.fileHandleForWriting.write(contentsOf: data)
        } catch { showError(text("CommandFailed", error.localizedDescription)) }
    }
    func consume(_ data: Data) {
        pending.append(data)
        while let end = pending.firstIndex(of: 0x0a) {
            let line = pending.prefix(upTo: end); pending.removeSubrange(...end)
            guard let event = (try? JSONSerialization.jsonObject(with: line)) as? [String: Any] else { continue }
            handle(event)
        }
    }
    func handle(_ event: [String: Any]) {
        switch event["type"] as? String ?? "" {
        case "state":
            let previous = state
            pendingStart = false
            state = event["state"] as? String ?? "idle"
            sessionRole = event["role"] as? String ?? sessionRole
            status.stringValue = event["message"] as? String ?? ""
            code = event["code"] as? String ?? ""
            paused = event["paused"] as? Bool ?? false
            if let value = event["publicRoom"] as? Bool { roomType.selectedSegment = value ? 0 : 1 }
            if let value = event["maxPlayers"] as? Int, (2...10).contains(value) { count.selectItem(at: value - 2) }
            status.textColor = state == "error" ? .systemRed : Theme.text
            append(status.stringValue); refreshControls()
            if !active && previous != state {
                route.stringValue = ""; route.isHidden = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in self?.inspect(); self?.updateBrowsing() }
            }
        case "route": route.stringValue = event["message"] as? String ?? ""; route.isHidden = route.stringValue.isEmpty
        case "message":
            let value = event["message"] as? String ?? ""
            if event["level"] as? String == "error" { feedbackSend?.isEnabled = true; showError(value) } else { append(value) }
        case "roster":
            playerRows = event["players"] as? [[String: Any]] ?? []; players.reloadData(); refreshControls()
        case "rooms":
            roomRows = event["rows"] as? [[String: Any]] ?? []; rooms.reloadData()
            if event["loading"] as? Bool == true { hint.stringValue = text("RoomsLoading") }
            else if event["failed"] as? Bool == true { hint.stringValue = text("RoomsFailed") }
            else if roomRows.isEmpty { hint.stringValue = text("NoRooms") } else { hint.stringValue = "" }
            hint.isHidden = hint.stringValue.isEmpty
        case "inspection":
            let details = event["details"] as? [String: Any] ?? event
            mapState = details["mapState"] as? String ?? (details["installed"] as? Bool == true ? "unverified" : "unknown")
            mapMessage = details["message"] as? String ?? ""
            refreshControls()
        case "release":
            let available = event["available"] as? Bool == true
            notice.stringValue = available ? text("UpdateAvailable", event["version"] as? String ?? "") : ""
            releaseAvailable = available; notice.isHidden = !available; download.isHidden = !available; installUpdate.isHidden = !available
        case "update-ready": state = "idle"; NSApp.terminate(nil)
        case "feedback":
            feedbackSend?.isEnabled = true
            if event["success"] as? Bool == true { feedbackWindow?.close(); showMessage(text("FeedbackThanks")) }
            else { showMessage(event["message"] as? String ?? text("FeedbackFailed")) }
        default: break
        }
    }
    func append(_ value: String) {
        guard !value.isEmpty else { return }
        let formatter = DateFormatter(); formatter.dateFormat = "HH:mm:ss"
        journal.textStorage?.append(NSAttributedString(string: formatter.string(from: Date()) + "  " + value + "\n"))
        if journal.string.count > 50000 { journal.textStorage?.deleteCharacters(in: NSRange(location: 0, length: 10000)) }
        journal.scrollToEndOfDocument(nil)
    }
    func showError(_ value: String) { if pendingStart { state = "error"; pendingStart = false }; status.stringValue = value; status.textColor = .systemRed; append(value); refreshControls() }
    func showMessage(_ value: String) { let alert = NSAlert(); alert.messageText = value; alert.runModal() }
    func confirm(_ title: String, _ body: String, _ action: String) -> Bool {
        let alert = NSAlert(); alert.messageText = title; alert.informativeText = body
        alert.addButton(withTitle: action); alert.addButton(withTitle: text("Cancel"))
        return alert.runModal() == .alertFirstButtonReturn
    }
    func refreshControls() {
        statusLine.isHidden = browsing
        route.isHidden = route.stringValue.isEmpty
        notice.isHidden = !releaseAvailable
        roomSettings.isHidden = page != "host"
        let blockedByMap = !active && ["outdated", "missing", "unknown"].contains(mapState)
        mapCard.isHidden = !blockedByMap
        mapWarning.stringValue = mapState == "missing" ? text("NoMap") : (mapState == "unknown" ? text("NoDota") : text(page == "join" ? "MapCardJoin" : "MapCardHost"))
        difficultyRow.isHidden = blockedByMap || page == "join" || (active && state != "ended")
        for difficulty in difficulties { difficulty.isEnabled = backendAvailable && (!active || state == "ended") }
        autoStart.isHidden = page != "host" || active
        autoEnter.isHidden = page != "join"
        browser.isHidden = !browsing || blockedByMap; joinLine.isHidden = !browsing || away || blockedByMap
        roster.isHidden = !active || away || sessionRole == "solo" || state == "updating"
        codeLine.isHidden = code.isEmpty || away || sessionRole == "solo"
        roomLabel.stringValue = code
        gameActions.isHidden = !active || away || state == "updating"
        enter.isEnabled = backendAvailable && ["ready", "playing"].contains(state)
        stop.isEnabled = backendAvailable && state != "stopping"
        stop.title = sessionRole == "join" ? text("LeaveRoom") : (sessionRole == "solo" ? text("StopServer") : text("CloseRoom"))
        removePlayer.isHidden = sessionRole != "host"
        removePlayer.isEnabled = backendAvailable && players.selectedRow >= 0 && players.selectedRow < playerRows.count && playerRows[players.selectedRow]["host"] as? Bool != true
        pages.isEnabled = backendAvailable && (!active || sessionRole == "host")
        roomType.isEnabled = backendAvailable && (!active || (sessionRole == "host" && !busy))
        count.isEnabled = roomType.isEnabled; testMap.isEnabled = !active
        reopen.isHidden = !paused || sessionRole != "host" || away
        installUpdate.isEnabled = backendAvailable && !active && releaseAvailable
        autoStart.isEnabled = !active; autoEnter.isEnabled = backendAvailable
        refresh.isEnabled = backendAvailable
        let selected = rooms.selectedRow
        joinSelected.isEnabled = backendAvailable && !away && selected >= 0 && selected < roomRows.count && roomRows[selected]["joinable"] as? Bool != false
        updateMap.isEnabled = !active && backendAvailable; verify.isEnabled = !active && backendAvailable; subscribe.isEnabled = !active && backendAvailable
        if busy { progress.startAnimation(nil) } else { progress.stopAnimation(nil) }
        let mapKeys = ["ready": "MapReady", "outdated": "MapOutdated", "missing": "MapMissing", "unknown": "MapUnknown", "unverified": "MapUnverified", "checking": "MapChecking"]
        mapLabel.stringValue = mapMessage.isEmpty ? text(mapKeys[mapState] ?? "MapUnverified") : mapMessage
        mapLabel.textColor = ["outdated", "missing", "unknown"].contains(mapState) ? .systemOrange : Theme.muted
        if !active && !browsing {
            hint.stringValue = page == "host" ? text(roomType.selectedSegment == 0 ? "PublicHostingHint" : "PrivateHostingHint") : ""
        } else if active && !away && sessionRole == "host" {
            hint.stringValue = text(roomType.selectedSegment == 0 ? "PublicHostingHint" : "PrivateHostingHint")
        }
        hint.isHidden = hint.stringValue.isEmpty || (active && !away && sessionRole == "host")
    }
    @objc func saveSettings() {
        guard !preview else { return }
        defaults.set(pages.selectedSegment, forKey: "mode"); defaults.set(roomType.selectedSegment == 1, forKey: "privateRoom")
        defaults.set(count.indexOfSelectedItem + 2, forKey: "maxPlayers")
        defaults.set(autoStart.state == .on, forKey: "autoStartDota"); defaults.set(autoEnter.state == .on, forKey: "autoEnter")
        defaults.set(testMap.state == .on, forKey: "testMap")
        if active && sessionRole == "host" { send(["action": "roomSettings", "public": roomType.selectedSegment == 0, "maxPlayers": count.indexOfSelectedItem + 2]) }
        refreshControls()
    }
    @objc func changePage() {
        if active && sessionRole == "host" && pages.selectedSegment == 0 { pages.selectedSegment = 1 }
        saveSettings()
        if !active { status.stringValue = text(page == "host" ? "HostIdle" : "Idle"); status.textColor = Theme.text }
        refreshControls(); updateBrowsing()
    }
    func updateBrowsing() { send(["action": "browse", "active": browsing, "testMap": testMap.state == .on]) }
    @objc func autoEnterChanged() { saveSettings(); send(["action": "auto-enter", "enabled": autoEnter.state == .on]) }
    @objc func toggleDeveloper() { testMap.isHidden.toggle() }
    @objc func testMapChanged() { saveSettings(); inspect(); updateBrowsing() }
    @objc func toggleLogs() { journal.enclosingScrollView?.isHidden.toggle() }
    @objc func inspect() { send(["action": "inspect", "testMap": testMap.state == .on]) }
    @objc func reopenRoom() { send(["action": "reopen"]) }
    @objc func updateLauncher() { send(["action": "update-launcher"]) }
    @objc func checkVersion() { send(["action": "check-version"]) }
    @objc func refreshRooms() { send(["action": "refresh"]) }
    @objc func startGame(_ sender: NSButton) {
        guard backendAvailable && (!active || state == "ended") else { return }
        let mode = ["easy", "hard", "custom"][sender.tag]
        if active { send(["action": "next", "mode": mode]); return }
        pendingStart = true; sessionRole = page; state = "checking"; status.stringValue = text("Starting"); refreshControls()
        send(["action": "open", "sessionMode": page, "public": roomType.selectedSegment == 0, "mode": mode, "maxPlayers": count.indexOfSelectedItem + 2, "autoEnter": page == "solo" || autoStart.state == .on, "testMap": testMap.state == .on])
    }
    func join(_ value: String) {
        guard !active else { return }
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard normalized.range(of: "^[A-Z0-9]{6}$", options: .regularExpression) != nil else { showError(text("InvalidCode")); return }
        pendingStart = true; roomCode.stringValue = normalized; sessionRole = "join"; state = "joining"; status.stringValue = text("Connecting"); refreshControls()
        send(["action": "join", "code": normalized, "autoEnter": autoEnter.state == .on, "testMap": testMap.state == .on])
    }
    @objc func joinByCode() { join(roomCode.stringValue) }
    @objc func pasteCode() { roomCode.stringValue = NSPasteboard.general.string(forType: .string) ?? "" }
    @objc func joinRoom() {
        guard rooms.selectedRow >= 0, rooms.selectedRow < roomRows.count else { showError(text("ChooseRoom")); return }
        guard roomRows[rooms.selectedRow]["joinable"] as? Bool != false else { return }
        join(roomRows[rooms.selectedRow]["code"] as? String ?? "")
    }
    @objc func enterGame() { send(["action": "enter"]) }
    @objc func stopGame() {
        if state == "saving" && !confirm(text("SavingCloseTitle"), text("SavingCloseBody"), text("StopAnyway")) { return }
        state = "stopping"; refreshControls(); send(["action": "stop"])
    }
    @objc func kickPlayer() {
        let row = players.selectedRow
        guard sessionRole == "host", row >= 0, row < playerRows.count, playerRows[row]["host"] as? Bool != true else { return }
        let player = playerRows[row]
        if confirm(text("KickConfirm", player["name"] as? String ?? text("Player")), "", text("Kick")) { send(["action": "kick", "key": player["key"] as? String ?? ""]) }
    }
    func copy(_ value: String) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(value, forType: .string) }
    @objc func copyRoom() { copy(code) }
    @objc func copyConnect() { copy("connect 127.0.0.1:27016"); append(text("ConsoleSteps")) }
    @objc func updateWorkshop() { send(["action": "update", "testMap": testMap.state == .on]) }
    @objc func verifyFiles() { send(["action": "verify"]) }
    @objc func subscribeMap() { send(["action": "subscribe", "testMap": testMap.state == .on]) }
    @objc func openDownload() { if !preview { NSWorkspace.shared.open(URL(string: "https://windy10v10ai.com/launch")!) } }
    @objc func openChangelog() { if !preview { NSWorkspace.shared.open(URL(string: "https://windy10v10ai.com/launch#changelog")!) } }
    @objc func openLogs() {
        guard !preview else { return }
        let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/WindyMac")
        if FileManager.default.fileExists(atPath: url.path) { NSWorkspace.shared.open(url) } else { append(text("LogsNotCreated")) }
    }
    @objc func about() { let alert = NSAlert(); alert.messageText = text("Title") + " " + launcherVersion; alert.informativeText = text("LauncherLicense"); alert.runModal() }
    func numberOfRows(in tableView: NSTableView) -> Int { tableView === rooms ? roomRows.count : playerRows.count }
    func tableViewSelectionDidChange(_ notification: Notification) { refreshControls() }
    func tableView(_ tableView: NSTableView, viewFor column: NSTableColumn?, row: Int) -> NSView? {
        let identifier = column?.identifier.rawValue ?? "name"
        let value: String
        if tableView === rooms {
            let item = roomRows[row]
            switch identifier {
            case "map": value = text(["easy": "Easy", "hard": "Hard", "custom": "Custom"][item["map"] as? String ?? ""] ?? "Custom")
            case "players": value = "\(item["playerCount"] as? Int ?? 0)/\(item["maxPlayers"] as? Int ?? 10)"
            case "ping":
                let rtt = item["rtt"] as? Int ?? item["latency"] as? Int ?? -1; let relay = item["relayRtt"] as? Int ?? -1
                value = rtt >= 0 ? text("ProbeLatency", String(rtt)) : (relay >= 0 ? text("ProbeRelayLatency", String(relay)) : text("ProbeTesting"))
            default:
                let name = item["name"] as? String ?? text("Player")
                value = name + (item["started"] as? Bool == true ? " · " + text("PlayingFor", String(item["minutes"] as? Int ?? 0)) : "")
            }
        } else {
            let item = playerRows[row]
            if identifier == "status" {
                let states = ["StatusConnecting", "StatusLoading", "StatusInGame", "StatusFailed", "StatusLeft", "StatusInRoom", "StatusWaiting"]
                let index = item["status"] as? Int ?? 0; value = text(states.indices.contains(index) ? states[index] : "StatusInRoom")
            } else { value = (item["host"] as? Bool == true ? text("TagHost") + " · " : "") + (item["name"] as? String ?? text("Player")) }
        }
        let field = label(value, size: 12); field.lineBreakMode = .byTruncatingTail; field.toolTip = value
        guard identifier == "name" else { return stack([field], horizontal: true) }
        var icons = [(String, String)]()
        if tableView === rooms {
            for avatar in roomRows[row]["avatars"] as? [[String: Any]] ?? [] {
                icons.append((avatar["url"] as? String ?? "", avatar["name"] as? String ?? ""))
            }
        } else { icons.append((playerRows[row]["avatarUrl"] as? String ?? "", playerRows[row]["name"] as? String ?? "")) }
        var views = [NSView]()
        for (url, name) in icons.prefix(3) {
            let image = NSImageView(); image.image = avatar(url); image.toolTip = name
            image.widthAnchor.constraint(equalToConstant: 24).isActive = true
            image.heightAnchor.constraint(equalToConstant: 24).isActive = true
            views.append(image)
        }
        views.append(field)
        if tableView === rooms, roomRows[row]["friends"] as? Bool == true { field.toolTip = value + " · " + text("FriendGame") }
        return stack(views, horizontal: true, spacing: 5)
    }
    func avatar(_ address: String) -> NSImage? {
        if let cached = avatarCache[address] { return cached }
        if !preview, !avatarRequests.contains(address), let url = URL(string: address), url.scheme == "https" {
            avatarRequests.insert(address)
            URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
                guard let data = data, let image = NSImage(data: data) else { return }
                DispatchQueue.main.async {
                    self?.avatarCache[address] = image; self?.rooms.reloadData(); self?.players.reloadData()
                }
            }.resume()
        }
        return NSImage(systemSymbolName: "person.crop.circle", accessibilityDescription: text("Player"))
    }
    @objc func showFeedback() {
        if let window = feedbackWindow { window.makeKeyAndOrderFront(nil); return }
        let sheet = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 650), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        sheet.backgroundColor = Theme.background
        sheet.title = text("FeedbackTitle"); sheet.isReleasedWhenClosed = false; sheet.center()
        let root = stack([], spacing: 12); root.translatesAutoresizingMaskIntoConstraints = false; sheet.contentView!.addSubview(root)
        NSLayoutConstraint.activate([root.leadingAnchor.constraint(equalTo: sheet.contentView!.leadingAnchor, constant: 24), root.trailingAnchor.constraint(equalTo: sheet.contentView!.trailingAnchor, constant: -24), root.topAnchor.constraint(equalTo: sheet.contentView!.topAnchor, constant: 24), root.bottomAnchor.constraint(equalTo: sheet.contentView!.bottomAnchor, constant: -24)])
        let kind = NSSegmentedControl(labels: [text("TypeProblem"), text("TypeSuggestion")], trackingMode: .selectOne, target: nil, action: nil); kind.selectedSegment = 0; kind.target = self; kind.action = #selector(feedbackKindChanged)
        feedbackType = kind; root.addArrangedSubview(kind)
        root.addArrangedSubview(label(text("RelatedTo") + " · " + text("UpToTwo")))
        let topicKeys = ["TopicHero", "TopicAbility", "TopicAwakening", "TopicItem", "TopicBot", "TopicBalance", "TopicUI", "TopicMembership", "TopicLag", "TopicLauncher", "TopicWebsite"]
        feedbackTopics = topicKeys.enumerated().map { index, key in let view = NSButton(checkboxWithTitle: text(key), target: self, action: #selector(topicChanged(_:))); view.tag = index; return view }
        for offset in stride(from: 0, to: feedbackTopics.count, by: 3) { root.addArrangedSubview(stack(Array(feedbackTopics[offset..<min(offset + 3, feedbackTopics.count)]), horizontal: true)) }
        root.addArrangedSubview(label(text("Description")))
        let description = NSTextView(); description.font = .systemFont(ofSize: 13); description.isRichText = false; description.delegate = self; feedbackDescription = description
        let scroll = NSScrollView(); scroll.hasVerticalScroller = true; scroll.borderType = .bezelBorder; scroll.documentView = description
        description.isVerticallyResizable = true; description.autoresizingMask = [.width]; description.textContainer?.widthTracksTextView = true
        scroll.heightAnchor.constraint(equalToConstant: 160).isActive = true; root.addArrangedSubview(scroll)
        let attach = NSButton(checkboxWithTitle: text("AttachLog"), target: nil, action: nil); attach.state = .on; attach.toolTip = text("AttachLogHint"); feedbackLog = attach; root.addArrangedSubview(attach)
        root.addArrangedSubview(stack([label(text("PrivacyNote")), button(text("PrivacyLink"), #selector(openPrivacy))], horizontal: true))
        let send = button(text("Send"), #selector(submitFeedback)); feedbackSend = send; root.addArrangedSubview(send)
        for view in root.arrangedSubviews { view.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true }
        feedbackWindow = sheet; feedbackKindChanged(); if option("--screenshot") == nil { sheet.makeKeyAndOrderFront(nil) }
    }
    @objc func feedbackKindChanged() { feedbackDescription?.toolTip = text(feedbackType?.selectedSegment == 1 ? "SuggestionCue" : "ProblemCue") }
    func textDidChange(_ notification: Notification) {
        if let description = feedbackDescription, description.string.count > 1000 { description.string = String(description.string.prefix(1000)) }
    }
    @objc func topicChanged(_ sender: NSButton) { if feedbackTopics.filter({ $0.state == .on }).count > 2 { sender.state = .off } }
    @objc func openPrivacy() { if !preview { NSWorkspace.shared.open(URL(string: "https://windy10v10ai.com/launch/code-signing#privacy")!) } }
    @objc func submitFeedback() {
        let description = feedbackDescription?.string.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard feedbackType?.selectedSegment != 1 || !description.isEmpty else { showMessage(text("FeedbackDescriptionRequired")); return }
        feedbackSend?.isEnabled = false
        let topics = ["hero", "ability", "awaken", "item", "bot", "balance", "ui", "member", "lag", "launcher", "web"]
        send(["action": "feedback", "kind": feedbackType?.selectedSegment == 1 ? "suggestion" : "problem", "topics": feedbackTopics.filter({ $0.state == .on }).map({ topics[$0.tag] }), "description": description, "attachLog": feedbackLog?.state == .on])
    }
    func savePreview(_ path: String) {
        guard preview, path.hasPrefix("/"), let view = (feedbackWindow ?? window)?.contentView else {
            fputs("Preview screenshot requires an absolute output path\n", stderr); exit(1)
        }
        view.layoutSubtreeIfNeeded()
        guard let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
            fputs("Could not allocate preview bitmap\n", stderr); exit(1)
        }
        guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
            fputs("Could not create preview graphics context\n", stderr); exit(1)
        }
        view.effectiveAppearance.performAsCurrentDrawingAppearance {
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = context
            Theme.background.setFill()
            view.bounds.fill()
            view.displayIgnoringOpacity(view.bounds, in: context)
            NSGraphicsContext.restoreGraphicsState()
        }
        guard let png = bitmap.representation(using: .png, properties: [:]) else {
            fputs("Could not encode preview PNG\n", stderr); exit(1)
        }
        do { try png.write(to: URL(fileURLWithPath: path), options: .atomic) }
        catch { fputs("Could not write preview PNG: \(error.localizedDescription)\n", stderr); exit(1) }
        print("Saved preview: " + path)
        state = "idle"; NSApp.terminate(nil)
    }
    func previewState() {
        mapState = "ready"
        switch option("--preview-state") ?? "idle" {
        case "host", "join":
            let role = option("--preview-state")!; pages.selectedSegment = role == "host" ? 1 : 2
            handle(["type": "state", "role": role, "state": "ready", "code": "Z82QCT", "message": text("HostGuide")])
            handle(["type": "roster", "players": [["key": "host", "name": "Windy", "host": true, "status": 2], ["key": "guest", "name": "Player", "status": 5]]])
        case "rooms":
            pages.selectedSegment = 2
            handle(["type": "rooms", "rows": [["code": "Z82QCT", "name": "Windy", "map": "easy", "playerCount": 3, "maxPlayers": 10, "rtt": 32], ["code": "ABC123", "name": "Player", "map": "hard", "playerCount": 2, "maxPlayers": 6, "relayRtt": 68]]])
        case "feedback": showFeedback()
        case "update": handle(["type": "release", "available": true, "version": "1.0.0"])
        default: break
        }
        refreshControls()
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if active && !preview && !confirm(text("QuitTitle"), text("QuitBody"), text("Close")) { return .terminateCancel }
        if let process = engine, process.isRunning { closing = true; send(["action": "quit"]); return .terminateLater }
        return .terminateNow
    }
}
let app = NSApplication.shared
let delegate = Launcher()
app.delegate = delegate
app.run()
