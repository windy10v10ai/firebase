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

private final class AvatarStrip: NSView {
    init(_ avatars: [NSView]) {
        super.init(frame: .zero)
        for avatar in avatars { addSubview(avatar) }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override var intrinsicContentSize: NSSize { NSSize(width: min(150, 26 + CGFloat(max(0, subviews.count - 1)) * 19), height: 26) }
    override func layout() {
        super.layout()
        let step = subviews.count > 1 ? min(19, (bounds.width - 26) / CGFloat(subviews.count - 1)) : 0
        for (index, avatar) in subviews.enumerated() { avatar.frame = NSRect(x: CGFloat(index) * step, y: 0, width: 26, height: 26) }
    }
}

final class LatencyView: NSView, NSViewToolTipOwner {
    let latency: Int
    let unreachable: Bool
    var tip: String?
    init(latency: Int, unreachable: Bool) {
        self.latency = latency; self.unreachable = unreachable
        super.init(frame: .zero)
        widthAnchor.constraint(equalToConstant: 40).isActive = true
        heightAnchor.constraint(equalToConstant: 24).isActive = true
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    // 视图尺寸由自动布局在之后才定下来，提示区域要跟着布局重设，否则悬停没有反应
    override func layout() {
        super.layout()
        removeAllToolTips()
        if tip != nil { addToolTip(bounds, owner: self, userData: nil) }
    }
    func view(_ view: NSView, stringForToolTip tag: NSView.ToolTipTag, point: NSPoint, userData data: UnsafeMutableRawPointer?) -> String { tip ?? "" }
    override func draw(_ dirtyRect: NSRect) {
        let lit = latency < 0 ? 0 : (latency < 60 ? 3 : (latency <= 120 ? 2 : 1))
        let color = Theme.color(latency < 60 ? 0x3fb67a : (latency <= 120 ? 0xe5a93a : 0xe5484d))
        for (index, height) in [CGFloat(4), 8, 12].enumerated() {
            (index < lit ? color : Theme.border).setFill()
            NSBezierPath(roundedRect: NSRect(x: bounds.midX - 8 + CGFloat(index) * 6, y: bounds.midY - 6, width: 3, height: height), xRadius: 1, yRadius: 1).fill()
        }
        if unreachable && latency < 0 {
            Theme.color(0xe5484d).setStroke()
            let slash = NSBezierPath(); slash.lineWidth = 2; slash.lineCapStyle = .round
            slash.move(to: NSPoint(x: bounds.midX - 7, y: bounds.midY + 5.5))
            slash.line(to: NSPoint(x: bounds.midX + 7, y: bounds.midY - 5.5)); slash.stroke()
        }
    }
}

final class LauncherButton: NSButton {
    var primary = false
    var link = false
    var pill = false
    var compact = false
    var underlined = false
    override var alignmentRectInsets: NSEdgeInsets { NSEdgeInsetsZero }
    override var intrinsicContentSize: NSSize {
        NSSize(width: ceil((title as NSString).size(withAttributes: [.font: font ?? NSFont.systemFont(ofSize: 12)]).width) + (link ? 4 : 24) + (image == nil ? 0 : 17), height: link || compact ? 22 : 30)
    }
    override func draw(_ dirtyRect: NSRect) {
        let selected = state == .on
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: pill ? 14 : 5, yRadius: pill ? 14 : 5)
        if !link {
            (primary ? Theme.accent : (isHighlighted || selected ? Theme.border : Theme.panel)).withAlphaComponent(isEnabled ? 1 : 0.45).setFill(); path.fill()
            (selected || window?.firstResponder === self ? Theme.accent : Theme.border).setStroke(); path.stroke()
        }
        let font = self.font ?? NSFont.systemFont(ofSize: 12)
        var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: (link && !isHighlighted ? Theme.muted : Theme.text).withAlphaComponent(isEnabled ? 1 : 0.4)]
        if underlined { attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue }
        let size = (title as NSString).size(withAttributes: attributes)
        let iconWidth: CGFloat = image == nil ? 0 : 17
        let textWidth = min(size.width, max(0, bounds.width - iconWidth - 4))
        let left = bounds.midX - (textWidth + iconWidth) / 2
        if let image = image {
            let symbol = image.withSymbolConfiguration(NSImage.SymbolConfiguration(paletteColors: [Theme.text])) ?? image
            symbol.draw(in: NSRect(x: left, y: bounds.midY - 6, width: 12, height: 12), from: .zero, operation: .sourceOver, fraction: isEnabled ? 1 : 0.4, respectFlipped: true, hints: nil)
        }
        (title as NSString).draw(in: NSRect(x: left + iconWidth, y: bounds.midY - size.height / 2, width: textWidth, height: size.height), withAttributes: attributes)
    }
    override func resetCursorRects() {
        super.resetCursorRects()
        if link { addCursorRect(bounds, cursor: .pointingHand) }
    }
}

private func segmentFrame(_ bounds: NSRect, index: Int, count: Int) -> NSRect {
    let width = bounds.width / CGFloat(count)
    return NSRect(x: bounds.minX + CGFloat(index) * width, y: bounds.minY, width: width, height: bounds.height)
}

private final class SegmentCell: NSSegmentedCell {
    var badgeCount = 0
    var hosting = false
    override func draw(withFrame frame: NSRect, in view: NSView) {
        Theme.panel.setFill(); NSBezierPath(roundedRect: frame, xRadius: 7, yRadius: 7).fill()
        for index in 0..<segmentCount {
            let rect = segmentFrame(frame, index: index, count: segmentCount).insetBy(dx: 2, dy: 2)
            if isSelected(forSegment: index) {
                Theme.border.withAlphaComponent(0.35).setFill()
                let path = NSBezierPath(roundedRect: rect, xRadius: 6, yRadius: 6); path.fill()
                Theme.accent.setStroke(); path.stroke()
            }
            let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center
            let enabled = isEnabled && isEnabled(forSegment: index)
            let font = NSFont.systemFont(ofSize: 12)
            let title = index == 2 && badgeCount > 0 ? text("JoinRoom") : (label(forSegment: index) ?? "")
            let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: Theme.text.withAlphaComponent(enabled ? 1 : 0.4), .paragraphStyle: paragraph]
            let titleHeight = (title as NSString).size(withAttributes: attributes).height
            var titleRect = NSRect(x: rect.minX, y: rect.midY - titleHeight / 2, width: rect.width, height: titleHeight)
            if index == 2 && badgeCount > 0 {
                let titleWidth = (title as NSString).size(withAttributes: [.font: font]).width
                let badge = NSRect(x: rect.midX + (titleWidth - 22) / 2 + 8, y: rect.midY - 8, width: 22, height: 16)
                titleRect = NSRect(x: rect.midX - (titleWidth + 30) / 2, y: titleRect.minY, width: titleWidth, height: titleHeight)
                let path = NSBezierPath(roundedRect: badge, xRadius: 8, yRadius: 8)
                Theme.color(0x162634).setFill(); path.fill(); Theme.color(0x315372).setStroke(); path.stroke()
                let badgeAttributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 10), .foregroundColor: Theme.color(0x8dbce5), .paragraphStyle: paragraph]
                let badgeHeight = (String(badgeCount) as NSString).size(withAttributes: badgeAttributes).height
                (String(badgeCount) as NSString).draw(in: NSRect(x: badge.minX, y: badge.midY - badgeHeight / 2, width: badge.width, height: badgeHeight), withAttributes: badgeAttributes)
            }
            (title as NSString).draw(in: titleRect, withAttributes: attributes)
            if index == 1 && hosting {
                let titleWidth = (title as NSString).size(withAttributes: [.font: font]).width
                Theme.color(0x3fb67a).setFill(); NSBezierPath(ovalIn: NSRect(x: rect.midX - titleWidth / 2 - 10, y: rect.midY - 3, width: 6, height: 6)).fill()
            }
        }
    }
}

private final class TabControl: NSSegmentedControl {
    override var alignmentRectInsets: NSEdgeInsets { NSEdgeInsetsZero }
    override func mouseDown(with event: NSEvent) {
        guard isEnabled else { return }
        let point = convert(event.locationInWindow, from: nil)
        guard let index = (0..<segmentCount).first(where: { segmentFrame(bounds, index: $0, count: segmentCount).contains(point) }),
              isEnabled(forSegment: index), index != selectedSegment else { return }
        selectedSegment = index; needsDisplay = true
        sendAction(action, to: target)
    }
}

private func segments(_ labels: [String]) -> NSSegmentedControl {
    let view = TabControl(); view.cell = SegmentCell()
    view.segmentCount = labels.count; view.trackingMode = .selectOne; view.segmentDistribution = .fillEqually
    for (index, label) in labels.enumerated() { view.setLabel(label, forSegment: index) }
    return view
}

private final class RoomCodeCell: NSTextFieldCell {
    override func drawingRect(forBounds rect: NSRect) -> NSRect {
        var frame = super.drawingRect(forBounds: rect)
        let height = cellSize(forBounds: rect).height
        frame.origin.y = rect.midY - height / 2; frame.size.height = height
        return frame
    }
    override func edit(withFrame rect: NSRect, in view: NSView, editor: NSText, delegate: Any?, event: NSEvent?) {
        super.edit(withFrame: drawingRect(forBounds: rect), in: view, editor: editor, delegate: delegate, event: event)
    }
    override func select(withFrame rect: NSRect, in view: NSView, editor: NSText, delegate: Any?, start: Int, length: Int) {
        super.select(withFrame: drawingRect(forBounds: rect), in: view, editor: editor, delegate: delegate, start: start, length: length)
    }
}

private final class DescriptionView: NSTextView {
    var placeholder = "" { didSet { needsDisplay = true } }
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        if string.isEmpty {
            (placeholder as NSString).draw(in: bounds.insetBy(dx: 6, dy: 6), withAttributes: [.font: font ?? NSFont.systemFont(ofSize: 12), .foregroundColor: Theme.muted])
        }
    }
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

final class Launcher: NSObject, NSApplicationDelegate, NSTableViewDataSource, NSTableViewDelegate, NSTextViewDelegate, NSTextFieldDelegate, NSMenuItemValidation {
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
    var roomRows: [[String: Any]] = [["header": text("SectionWaiting")], ["empty": text("RoomsLoading")]]
    var playerRows = [[String: Any]]()
    var feedbackWindow: NSWindow?
    var feedbackType: NSSegmentedControl?
    var feedbackDescription: NSTextView?
    var feedbackLog: NSButton?
    var feedbackTopics = [NSButton]()
    var feedbackSend: NSButton?
    let defaults = UserDefaults.standard
    let pages = segments([text("Solo"), text("HostRoom"), text("JoinRoom")])
    let roomType = segments([text("PublicRoom"), text("PrivateRoom")])
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
    let enter = LauncherButton(title: text("EnterGame"), target: nil, action: nil)
    let stop = LauncherButton(title: text("StopServer"), target: nil, action: nil)
    let copyCode = LauncherButton(title: text("Copy"), target: nil, action: nil)
    let reopen = LauncherButton(title: text("Reopen"), target: nil, action: nil)
    let installUpdate = LauncherButton(title: text("Update"), target: nil, action: nil)
    let refresh = LauncherButton(title: text("Refresh"), target: nil, action: nil)
    let updateMap = LauncherButton(title: text("UpdateMap"), target: nil, action: nil)
    let subscribe = LauncherButton(title: text("Subscribe"), target: nil, action: nil)
    let download = LauncherButton(title: text("OpenDownloadPage"), target: nil, action: nil)
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
    var body: NSStackView!
    var footer: NSStackView!
    var hostGuide: NSStackView!
    var updateNotice: NSStackView!
    var mapDot = NSTextField(labelWithString: "●")
    var playerCount = NSTextField(labelWithString: "")
    var codeJoin: NSButton!
    var badgeTimer: Timer?
    var lastBadge = Date.distantPast
    var mapCard: NSStackView!
    let mapWarning = NSTextField(wrappingLabelWithString: "")

    var page: String { ["solo", "host", "join"][max(0, pages.selectedSegment)] }
    var active: Bool { !["idle", "error"].contains(state) }
    var busy: Bool { ["checking", "opening", "loading", "joining", "stopping", "saving", "updating", "updating-launcher"].contains(state) }
    var away: Bool { active && sessionRole == "host" && page == "join" }
    var browsing: Bool { page == "join" && (!active || away) }

    func label(_ value: String, size: CGFloat = 12, weight: NSFont.Weight = .regular) -> NSTextField {
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
        if horizontal { view.distribution = .fill }
        if !horizontal { for child in views { child.widthAnchor.constraint(equalTo: view.widthAnchor).isActive = true } }
        return view
    }
    func spacer() -> NSView {
        let view = NSView()
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return view
    }
    func action(_ button: NSButton, _ selector: Selector) {
        button.target = self; button.action = selector; button.font = .systemFont(ofSize: 12)
    }
    func button(_ title: String, _ selector: Selector) -> LauncherButton {
        let view = LauncherButton(title: title, target: self, action: selector)
        view.font = .systemFont(ofSize: 12)
        return view
    }
    func table(_ table: NSTableView, columns: [(String, String, CGFloat)], height: CGFloat) -> NSScrollView {
        for (identifier, title, width) in columns {
            let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier(identifier))
            column.title = title; column.width = width; column.minWidth = 50
            table.addTableColumn(column)
        }
        table.delegate = self; table.dataSource = self; table.rowHeight = 34
        table.style = .plain; table.intercellSpacing = .zero
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
    func panel(_ views: [NSView], color: NSColor = Theme.panel) -> NSStackView {
        let view = stack(views, spacing: 8)
        view.edgeInsets = NSEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
        for constraint in view.constraints where constraint.firstAttribute == .width { constraint.constant = -24 }
        view.wantsLayer = true; view.layer?.backgroundColor = color.cgColor
        view.layer?.cornerRadius = 7; view.layer?.borderWidth = 1; view.layer?.borderColor = Theme.border.cgColor
        return view
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular); NSApp.appearance = NSAppearance(named: .darkAqua)
        if let url = Bundle.main.url(forResource: "Launcher", withExtension: "icns") { NSApp.applicationIconImage = NSImage(contentsOf: url) }
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 480, height: 480), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.title = text("Title"); window.center(); window.backgroundColor = Theme.background
        let content = window.contentView!
        content.wantsLayer = true; content.layer?.backgroundColor = Theme.background.cgColor
        let banner = Banner(); banner.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(banner)
        body = stack([], spacing: 12); body.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(body)
        NSLayoutConstraint.activate([
            banner.leadingAnchor.constraint(equalTo: content.leadingAnchor), banner.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            banner.topAnchor.constraint(equalTo: content.topAnchor), banner.heightAnchor.constraint(equalToConstant: 80),
            body.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20), body.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),
            body.topAnchor.constraint(equalTo: banner.bottomAnchor, constant: 12)
        ])
        let version = button("v" + launcherVersion + " ↗", #selector(openChangelog)); version.link = true; version.toolTip = text("Changelog")
        let subtitle = label(text("Subtitle"), size: 11); subtitle.textColor = Theme.muted
        subtitle.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        body.addArrangedSubview(stack([subtitle, spacer(), version], horizontal: true, spacing: 4))
        pages.heightAnchor.constraint(equalToConstant: 36).isActive = true
        pages.selectedSegment = preview ? 0 : min(2, max(0, defaults.integer(forKey: "mode")))
        pages.target = self; pages.action = #selector(changePage); body.addArrangedSubview(pages)
        roomType.heightAnchor.constraint(equalToConstant: 30).isActive = true
        roomType.widthAnchor.constraint(equalToConstant: languageCode == "ru-RU" ? 166 : 140).isActive = true
        roomType.selectedSegment = preview ? 0 : (defaults.bool(forKey: "privateRoom") ? 1 : 0)
        roomType.target = self; roomType.action = #selector(saveSettings)
        count.addItems(withTitles: (2...10).map { text("PlayersOption", String($0)) }); count.font = .systemFont(ofSize: 11)
        let savedCount = defaults.integer(forKey: "maxPlayers")
        count.selectItem(at: preview || !(2...10).contains(savedCount) ? 8 : savedCount - 2)
        count.target = self; count.action = #selector(saveSettings)
        roomSettings = stack([label(text("RoomType"), size: 11), roomType, spacer(), label(text("MaxPlayers"), size: 11), count], horizontal: true, spacing: 6)
        body.addArrangedSubview(roomSettings)
        mapWarning.maximumNumberOfLines = 4; mapWarning.font = .systemFont(ofSize: 12)
        action(updateMap, #selector(updateWorkshop)); action(subscribe, #selector(subscribeMap))
        mapCard = panel([label(text("MapCardTitle"), weight: .semibold), mapWarning, stack([updateMap, subscribe, spacer()], horizontal: true)])
        body.addArrangedSubview(mapCard)
        action(refresh, #selector(refreshRooms))
        rooms.target = self; rooms.doubleAction = #selector(joinRoom)
        let roomTable = table(rooms, columns: [("room", "", 438)], height: 280); rooms.headerView = nil
        let heading = roomColumns(NSView(), label(text("ColumnMap"), size: 10), label(text("ColumnPlayers"), size: 10), label(text("ColumnPing"), size: 10))
        heading.heightAnchor.constraint(equalToConstant: 18).isActive = true
        browser = stack([stack([label(text("PublicRooms"), weight: .semibold), spacer(), refresh], horizontal: true), heading, roomTable], spacing: 6)
        body.addArrangedSubview(browser)
        roomCode.cell = RoomCodeCell(textCell: "")
        roomCode.isEditable = true; roomCode.isSelectable = true; roomCode.isBezeled = true; roomCode.drawsBackground = true
        roomCode.placeholderString = text("CodeExample"); roomCode.font = .monospacedSystemFont(ofSize: 12, weight: .medium)
        roomCode.target = self; roomCode.action = #selector(joinByCode); roomCode.delegate = self
        roomCode.heightAnchor.constraint(equalToConstant: 34).isActive = true
        roomCode.setContentHuggingPriority(.defaultLow, for: .horizontal)
        codeJoin = button(text("Join"), #selector(joinByCode)); (codeJoin as? LauncherButton)?.primary = true
        codeJoin.heightAnchor.constraint(equalToConstant: 34).isActive = true
        joinLine = stack([roomCode, codeJoin], horizontal: true, spacing: 8); body.addArrangedSubview(joinLine)
        playerCount.font = .systemFont(ofSize: 11); playerCount.textColor = Theme.muted
        let playerTable = table(players, columns: [("player", "", 412)], height: 130); players.headerView = nil
        roster = panel([stack([label(text("PlayersInRoom"), size: 11), spacer(), playerCount], horizontal: true), playerTable])
        body.addArrangedSubview(roster)
        difficultyRow = stack([], horizontal: true, spacing: 10)
        for (index, key) in ["Easy", "Hard", "Custom"].enumerated() {
            let difficulty = DifficultyButton(title: text(key), target: self, action: #selector(startGame(_:)))
            difficulty.subtitle = ["N1 ~ N5", "N6 ~ N8", text("CustomSub")][index]; difficulty.setAccessibilityHelp(difficulty.subtitle)
            difficulty.tag = index; difficulty.heightAnchor.constraint(equalToConstant: 84).isActive = true
            difficultyRow.addArrangedSubview(difficulty); difficulties.append(difficulty)
        }
        difficultyRow.distribution = .fillEqually; body.addArrangedSubview(difficultyRow)
        autoStart.state = preview || defaults.object(forKey: "autoStartDota") == nil || defaults.bool(forKey: "autoStartDota") ? .on : .off
        autoEnter.state = preview || defaults.object(forKey: "autoEnter") == nil || defaults.bool(forKey: "autoEnter") ? .on : .off
        autoStart.target = self; autoStart.action = #selector(saveSettings); autoStart.font = .systemFont(ofSize: 11)
        autoEnter.target = self; autoEnter.action = #selector(autoEnterChanged); autoEnter.font = .systemFont(ofSize: 11)
        body.addArrangedSubview(autoStart)
        let guide = NSTextField(wrappingLabelWithString: ""); guide.font = .systemFont(ofSize: 12); guide.textColor = Theme.text
        hostGuide = panel([guide], color: Theme.color(0x17251c)); hostGuide.layer?.borderColor = Theme.color(0x2d5a3e).cgColor
        body.addArrangedSubview(hostGuide)
        codeLine = stack([label(text("RoomCode"), size: 11)]); body.addArrangedSubview(codeLine)
        roomLabel.font = .monospacedSystemFont(ofSize: 19, weight: .semibold); roomLabel.isSelectable = true; roomLabel.textColor = Theme.text
        action(copyCode, #selector(copyRoom)); copyCode.title = "⧉"; copyCode.toolTip = text("Copy"); copyCode.setAccessibilityLabel(text("Copy"))
        copyCode.widthAnchor.constraint(equalToConstant: 28).isActive = true
        action(enter, #selector(enterGame)); action(stop, #selector(stopGame)); enter.primary = true
        gameActions = stack([roomLabel, copyCode, enter, spacer(), stop], horizontal: true, spacing: 8); body.addArrangedSubview(gameActions)
        status.font = .systemFont(ofSize: 12); status.textColor = Theme.muted; status.maximumNumberOfLines = 3
        progress.style = .spinning; progress.controlSize = .small; progress.isDisplayedWhenStopped = false
        statusLine = stack([progress, status], horizontal: true, spacing: 4); body.addArrangedSubview(statusLine)
        route.font = .systemFont(ofSize: 11); route.textColor = Theme.muted; body.addArrangedSubview(route)
        body.addArrangedSubview(autoEnter)
        hint.font = .systemFont(ofSize: 12); hint.textColor = Theme.text; hint.maximumNumberOfLines = 3; body.addArrangedSubview(hint)
        action(reopen, #selector(reopenRoom)); body.addArrangedSubview(reopen)
        notice.font = .systemFont(ofSize: 12); notice.maximumNumberOfLines = 3
        action(download, #selector(openDownload)); action(installUpdate, #selector(updateLauncher)); installUpdate.primary = true
        updateNotice = panel([notice, stack([installUpdate, download, spacer()], horizontal: true)])
        body.addArrangedSubview(updateNotice)
        let logScroll = NSScrollView(); logScroll.hasVerticalScroller = true; logScroll.borderType = .bezelBorder
        journal.isEditable = false; journal.isSelectable = true; journal.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        journal.textContainerInset = NSSize(width: 8, height: 8); journal.autoresizingMask = [.width]
        journal.isVerticallyResizable = true; journal.textContainer?.widthTracksTextView = true
        logScroll.documentView = journal; logScroll.heightAnchor.constraint(equalToConstant: 120).isActive = true
        body.addArrangedSubview(logScroll); logScroll.isHidden = true
        for view in body.arrangedSubviews { view.widthAnchor.constraint(equalTo: body.widthAnchor).isActive = true }
        let divider = NSBox(); divider.boxType = .separator; divider.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(divider)
        let developer = button(text("Developer"), #selector(toggleDeveloper)); developer.link = true; developer.font = .systemFont(ofSize: 10)
        let feedback = button(text("Feedback"), #selector(showFeedback)); feedback.font = .systemFont(ofSize: 10)
        feedback.compact = true; feedback.pill = true
        feedback.image = NSImage(systemSymbolName: "bubble.left", accessibilityDescription: text("Feedback"))
        testMap.state = preview ? .off : (defaults.bool(forKey: "testMap") ? .on : .off); testMap.font = .systemFont(ofSize: 10)
        testMap.isHidden = true; testMap.target = self; testMap.action = #selector(testMapChanged)
        mapLabel.font = .systemFont(ofSize: 10); mapLabel.lineBreakMode = .byTruncatingTail; mapLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        mapDot.font = .systemFont(ofSize: 9)
        footer = stack([mapDot, mapLabel, spacer(), testMap, feedback, developer], horizontal: true, spacing: 6)
        footer.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(footer)
        NSLayoutConstraint.activate([
            divider.leadingAnchor.constraint(equalTo: content.leadingAnchor), divider.trailingAnchor.constraint(equalTo: content.trailingAnchor), divider.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -40),
            footer.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20), footer.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20), footer.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -8)
        ])
        buildMenu(); refreshControls()
        if option("--screenshot") == nil { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
        if preview {
            previewState()
            if let path = option("--screenshot") { DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.savePreview(path) } }
        } else {
            launchEngine(); refreshBadge()
            badgeTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.refreshBadge() }
        }
    }
    func resizeWindow() {
        window.contentView?.layoutSubtreeIfNeeded()
        let height = max(page == "join" && browsing ? 620.0 : 480.0, 80 + 12 + body.fittingSize.height + 60)
        guard abs((window.contentView?.frame.height ?? 0) - height) > 1 else { return }
        let top = window.frame.maxY
        window.setContentSize(NSSize(width: 480, height: height))
        window.setFrameOrigin(NSPoint(x: window.frame.minX, y: top - window.frame.height))
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
        let maintenanceItem = NSMenuItem(); maintenanceItem.title = text("Developer"); menu.addItem(maintenanceItem)
        let maintenance = NSMenu(title: text("Developer")); maintenanceItem.submenu = maintenance
        for (title, action) in [(text("UpdateMap"), #selector(updateWorkshop)), (text("VerifyFiles"), #selector(verifyFiles)), (text("Subscribe"), #selector(subscribeMap)), (text("VersionCheck"), #selector(checkVersion)), (text("Logs"), #selector(toggleLogs)), (text("OpenLogs"), #selector(openLogs)), (text("CopyCommand"), #selector(copyConnect))] {
            let item = maintenance.addItem(withTitle: title, action: action, keyEquivalent: ""); item.target = self
        }
        NSApp.mainMenu = menu
    }
    func validateMenuItem(_ item: NSMenuItem) -> Bool {
        guard let action = item.action else { return true }
        if [#selector(updateWorkshop), #selector(verifyFiles), #selector(subscribeMap), #selector(checkVersion)].contains(action) { return backendAvailable && !active }
        return true
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
        case "route": route.stringValue = event["message"] as? String ?? ""; refreshControls()
        case "message":
            let value = event["message"] as? String ?? ""
            if event["level"] as? String == "error" { feedbackSend?.isEnabled = true; showError(value) } else { append(value) }
        case "roster":
            playerRows = event["players"] as? [[String: Any]] ?? []; players.reloadData(); refreshControls()
        case "badge": setBadge(event["count"] as? Int ?? 0)
        case "rooms":
            let rows = event["rows"] as? [[String: Any]] ?? []
            roomRows = rows.filter { $0["kind"] as? Int == 2 }
            for (kind, title) in [(0, "SectionWaiting"), (1, "SectionPlaying")] {
                let section = rows.filter { ($0["kind"] as? Int ?? 0) == kind }
                if kind == 0 || !section.isEmpty {
                    roomRows.append(["header": text(title)])
                    if section.isEmpty { roomRows.append(["empty": text("NoRooms")]) }
                    else { roomRows.append(contentsOf: section) }
                }
            }
            setBadge(event["count"] as? Int ?? rows.filter { ($0["kind"] as? Int ?? 0) == 0 }.count)
            rooms.reloadData()
            if event["loading"] as? Bool == true { hint.stringValue = text("RoomsLoading") }
            else if event["failed"] as? Bool == true { hint.stringValue = text("RoomsFailed") }
            else if rows.isEmpty { hint.stringValue = text("NoRooms") } else { hint.stringValue = "" }
            if rows.isEmpty {
                roomRows = [["header": text("SectionWaiting")], ["empty": hint.stringValue]]
                hint.stringValue = ""; rooms.reloadData()
            }
            refreshControls()
        case "inspection":
            let details = event["details"] as? [String: Any] ?? event
            mapState = details["mapState"] as? String ?? (details["installed"] as? Bool == true ? "unverified" : "unknown")
            mapMessage = details["message"] as? String ?? ""
            refreshControls()
        case "release":
            let available = event["available"] as? Bool == true
            notice.stringValue = available ? text("UpdateAvailable", event["version"] as? String ?? "") : ""
            releaseAvailable = available; refreshControls()
        case "update-ready":
            // 退出要等引擎进程结束的通知，该通知排在主队列里；在当前主队列任务内直接退出会互相等死，所以交给运行循环的定时器
            state = "idle"; Timer.scheduledTimer(withTimeInterval: 0, repeats: false) { _ in NSApp.terminate(nil) }
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
        let joinedRoom = active && sessionRole == "join" && !code.isEmpty
        let actionAnchor: NSView = joinedRoom ? autoEnter : codeLine
        if let actionIndex = body.arrangedSubviews.firstIndex(of: gameActions),
           let anchorIndex = body.arrangedSubviews.firstIndex(of: actionAnchor), actionIndex != anchorIndex + 1 {
            body.removeArrangedSubview(gameActions)
            if let index = body.arrangedSubviews.firstIndex(of: actionAnchor) { body.insertArrangedSubview(gameActions, at: index + 1) }
        }
        let blockedByMap = !active && (["missing", "unknown"].contains(mapState) || (mapState == "outdated" && page != "solo"))
        roomSettings.isHidden = page != "host" || blockedByMap
        mapCard.isHidden = !blockedByMap && !(mapState == "outdated" && !active)
        mapWarning.stringValue = mapState == "missing" ? text("NoMap") : (mapState == "unknown" ? text("NoDota") : text(page == "join" ? "MapCardJoin" : "MapCardHost"))
        updateMap.isHidden = mapState != "outdated"; subscribe.isHidden = mapState != "missing"
        difficultyRow.isHidden = blockedByMap || page == "join" || (active && state != "ended")
        for difficulty in difficulties { difficulty.isEnabled = backendAvailable && (!active || state == "ended") }
        autoStart.isHidden = page != "host" || active || blockedByMap
        autoEnter.isHidden = !joinedRoom
        browser.isHidden = !browsing || blockedByMap; joinLine.isHidden = !browsing || away || blockedByMap
        roster.isHidden = !active || away || sessionRole == "solo" || state == "updating"
        playerCount.stringValue = sessionRole == "host" ? "\(playerRows.count) / \(count.indexOfSelectedItem + 2)" : "\(playerRows.count)"
        let showRoomCode = !code.isEmpty && !away && sessionRole != "solo"
        codeLine.isHidden = !showRoomCode || joinedRoom
        roomLabel.stringValue = code; roomLabel.isHidden = !showRoomCode
        gameActions.isHidden = !active || away || ["updating", "updating-launcher"].contains(state)
        enter.isEnabled = backendAvailable && ["ready", "playing"].contains(state)
        enter.isHidden = !enter.isEnabled || (sessionRole == "host" && state == "playing")
        copyCode.isHidden = !showRoomCode
        stop.isEnabled = backendAvailable && state != "stopping"
        stop.title = sessionRole == "join" ? text("LeaveRoom") : (sessionRole == "solo" ? text("StopServer") : (busy ? text("Cancel") : text("CloseRoom")))
        pages.isEnabled = backendAvailable && (!active || sessionRole == "host")
        pages.setEnabled(!active, forSegment: 0)
        roomType.isEnabled = backendAvailable && (!active || (sessionRole == "host" && !busy))
        count.isEnabled = roomType.isEnabled; testMap.isEnabled = !active
        reopen.isHidden = !paused || sessionRole != "host" || away
        installUpdate.isEnabled = backendAvailable && !active && releaseAvailable
        autoStart.isEnabled = !active; autoEnter.isEnabled = backendAvailable
        refresh.isEnabled = backendAvailable
        codeJoin.isEnabled = backendAvailable && !active && roomCode.stringValue.trimmingCharacters(in: .whitespacesAndNewlines).range(of: "^[A-Za-z0-9]{6}$", options: .regularExpression) != nil
        updateMap.isEnabled = !active && backendAvailable; subscribe.isEnabled = !active && backendAvailable
        progress.isHidden = !busy
        if busy { progress.startAnimation(nil) } else { progress.stopAnimation(nil) }
        let mapKeys = ["ready": "MapReady", "outdated": "MapOutdated", "missing": "MapMissing", "unknown": "MapUnknown", "unverified": "MapUnverified", "checking": "MapChecking"]
        mapLabel.stringValue = text(mapKeys[mapState] ?? "MapUnverified"); mapLabel.toolTip = mapMessage
        mapDot.textColor = mapState == "ready" ? Theme.color(0x3fb67a) : (["outdated", "unverified"].contains(mapState) ? .systemOrange : Theme.muted)
        hostGuide.isHidden = page != "host" || active || blockedByMap || releaseAvailable
        (hostGuide.arrangedSubviews.first as? NSTextField)?.stringValue = "✓  " + text(autoStart.state == .on ? "HostGuide" : "HostGuideServerOnly")
        if !active && !browsing { hint.stringValue = "" }
        else if active && !away && sessionRole == "host" { hint.stringValue = text(roomType.selectedSegment == 0 ? "PublicHostingHint" : "PrivateHostingHint") }
        hint.isHidden = hint.stringValue.isEmpty || (active && !away && sessionRole == "host")
        statusLine.isHidden = browsing || !hostGuide.isHidden || blockedByMap || releaseAvailable
        route.isHidden = route.stringValue.isEmpty || away
        let showUpdate = releaseAvailable && !active && !blockedByMap
        updateNotice.isHidden = !showUpdate
        if active { statusLine.isHidden = away }
        (pages.cell as? SegmentCell)?.hosting = active && sessionRole == "host"
        pages.needsDisplay = true; roomType.needsDisplay = true
        resizeWindow()
    }
    func setBadge(_ count: Int) {
        (pages.cell as? SegmentCell)?.badgeCount = count; pages.setLabel(text("JoinRoom") + (count > 0 ? "  \(count)" : ""), forSegment: 2); pages.needsDisplay = true
    }
    @objc func refreshBadge() {
        guard !preview, window != nil, NSApp.isActive, !window.isMiniaturized, !browsing else { return }
        lastBadge = Date(); send(["action": "badge", "testMap": testMap.state == .on])
    }
    func applicationDidBecomeActive(_ notification: Notification) {
        if Date().timeIntervalSince(lastBadge) >= 10 { refreshBadge() }
    }
    func controlTextDidChange(_ notification: Notification) { refreshControls() }
    @objc func saveSettings() {
        if preview { refreshControls(); return }
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
    @objc func toggleDeveloper() { testMap.isHidden.toggle(); resizeWindow() }
    @objc func testMapChanged() { saveSettings(); inspect(); updateBrowsing() }
    @objc func toggleLogs() { journal.enclosingScrollView?.isHidden.toggle(); resizeWindow() }
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
    @objc func joinRoom() {
        let row = rooms.selectedRow
        guard row >= 0, row < roomRows.count, roomRows[row]["header"] == nil, roomRows[row]["empty"] == nil else { return }
        joinRoomAt(row)
    }
    @objc func joinFromRow(_ sender: NSButton) { joinRoomAt(sender.tag) }
    func joinRoomAt(_ row: Int) {
        guard row >= 0, row < roomRows.count, !away, roomRows[row]["joinable"] as? Bool != false,
              (roomRows[row]["kind"] as? Int ?? 0) == 0 else { return }
        join(roomRows[row]["code"] as? String ?? "")
    }
    @objc func enterGame() { send(["action": "enter"]) }
    @objc func stopGame() {
        if state == "saving" && !confirm(text("SavingCloseTitle"), text("SavingCloseBody"), text("StopAnyway")) { return }
        state = "stopping"; refreshControls(); send(["action": "stop"])
    }
    @objc func kickPlayer(_ sender: NSButton) {
        let row = sender.tag
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
    func numberOfRows(in tableView: NSTableView) -> Int { tableView === rooms ? roomRows.count : (playerRows.count + 1) / 2 }
    func tableViewSelectionDidChange(_ notification: Notification) { refreshControls() }
    func tableView(_ tableView: NSTableView, heightOfRow row: Int) -> CGFloat {
        if tableView === players { return 64 }
        return roomRows[row]["header"] != nil ? 24 : 52
    }
    func tableView(_ tableView: NSTableView, shouldSelectRow row: Int) -> Bool {
        tableView !== rooms || (!roomRows.isEmpty && roomRows[row]["header"] == nil && roomRows[row]["empty"] == nil)
    }
    func avatarView(_ address: String, name: String, size: CGFloat, anonymous: Bool = false) -> NSImageView {
        let image = NSImageView(); image.image = anonymous ? nil : avatar(address); image.toolTip = anonymous ? nil : name
        image.imageScaling = .scaleAxesIndependently
        if image.image == nil {
            let tints: [UInt32] = [0x9ec7a8, 0xa9c4e6, 0xe8cf9a, 0xc9b6e0, 0xe6a6a6]
            let tint = tints[name.utf8.reduce(0) { ($0 + Int($1)) % tints.count }]
            image.image = NSImage(size: NSSize(width: size, height: size), flipped: false) { bounds in
                if anonymous {
                    Theme.color(0x4a3f37).setFill(); NSBezierPath(ovalIn: bounds).fill()
                    Theme.muted.setStroke()
                    let head = NSBezierPath(ovalIn: NSRect(x: bounds.midX - 3.5, y: bounds.midY - 0.5, width: 7, height: 7)); head.lineWidth = 1.6; head.stroke()
                    let shoulders = NSBezierPath(); shoulders.lineWidth = 1.6
                    shoulders.appendArc(withCenter: NSPoint(x: bounds.midX, y: bounds.midY - 6.5), radius: 6.5, startAngle: 20, endAngle: 160)
                    shoulders.stroke(); return true
                }
                Theme.color(tint).setFill(); NSBezierPath(ovalIn: bounds).fill()
                let initial = (name.isEmpty ? "?" : String(name.prefix(1)).uppercased()) as NSString
                let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.boldSystemFont(ofSize: 11), .foregroundColor: Theme.background]
                let measured = initial.size(withAttributes: attributes)
                initial.draw(at: NSPoint(x: bounds.midX - measured.width / 2, y: bounds.midY - measured.height / 2), withAttributes: attributes)
                return true
            }
        }
        image.widthAnchor.constraint(equalToConstant: size).isActive = true; image.heightAnchor.constraint(equalToConstant: size).isActive = true
        image.wantsLayer = true; image.layer?.cornerRadius = size / 2; image.layer?.masksToBounds = true
        return image
    }
    func roomColumns(_ name: NSView, _ map: NSView, _ count: NSView, _ tail: NSView) -> NSView {
        let row = NSView()
        for child in [name, map, count, tail] {
            child.translatesAutoresizingMaskIntoConstraints = false; row.addSubview(child)
            child.centerYAnchor.constraint(equalTo: row.centerYAnchor).isActive = true
        }
        NSLayoutConstraint.activate([
            tail.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -10), tail.widthAnchor.constraint(equalToConstant: 110),
            count.trailingAnchor.constraint(equalTo: tail.leadingAnchor, constant: -8), count.widthAnchor.constraint(equalToConstant: 34),
            map.trailingAnchor.constraint(equalTo: count.leadingAnchor, constant: -8), map.widthAnchor.constraint(equalToConstant: 50),
            name.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 10), name.trailingAnchor.constraint(equalTo: map.leadingAnchor, constant: -8)
        ])
        return row
    }
    func tableView(_ tableView: NSTableView, viewFor column: NSTableColumn?, row: Int) -> NSView? {
        if tableView === rooms {
            let item = roomRows[row]
            if let title = item["header"] as? String {
                let heading = label(title, size: 10, weight: .semibold); heading.textColor = Theme.muted
                let row = stack([heading], horizontal: true); row.edgeInsets = NSEdgeInsets(top: 0, left: 10, bottom: 0, right: 10)
                row.wantsLayer = true; row.layer?.backgroundColor = Theme.background.cgColor
                return row
            }
            let kind = item["kind"] as? Int ?? 0
            if let empty = item["empty"] as? String {
                let message = label(empty, size: 11); message.textColor = Theme.muted; message.alignment = .center
                return stack([message], horizontal: true)
            }
            let friends = item["friends"] as? Bool == true
            let members = item["avatars"] as? [[String: Any]] ?? []
            let avatarCount = friends ? max(1, item["playerCount"] as? Int ?? 0) : max(1, members.count)
            let avatars = (0..<avatarCount).map { index -> NSView in
                let member = members.indices.contains(index) ? members[index] : [:]
                return avatarView(member["url"] as? String ?? "", name: member["name"] as? String ?? text("Player"), size: 26, anonymous: friends)
            }
            var nameViews: [NSView] = [AvatarStrip(avatars)]
            if kind != 1 { let name = label(kind == 2 ? text("YourRoom") : (item["name"] as? String ?? text("Player")), size: 12); name.lineBreakMode = .byTruncatingTail; name.setContentCompressionResistancePriority(.defaultLow, for: .horizontal); nameViews.append(name) }
            nameViews.append(spacer())
            let name = stack(nameViews, horizontal: true, spacing: 4); name.setContentHuggingPriority(.defaultLow, for: .horizontal)
            let map = label(text(friends ? "FriendGame" : (["easy": "Easy", "hard": "Hard", "custom": "Custom"][item["map"] as? String ?? ""] ?? "Custom")), size: 11)
            map.widthAnchor.constraint(equalToConstant: 50).isActive = true
            let count = label(kind == 1 ? text("RoomPlayers", String(item["playerCount"] as? Int ?? 0)) : "\(item["playerCount"] as? Int ?? 0)/\(item["maxPlayers"] as? Int ?? 10)", size: 11)
            count.widthAnchor.constraint(equalToConstant: 34).isActive = true
            let tail: NSView
            if kind == 1 {
                let duration = label(text("PlayingFor", String(item["minutes"] as? Int ?? 0)), size: 10); duration.textColor = Theme.muted; tail = duration
            } else if kind == 2 || away { tail = NSView() }
            else {
                let rtt = item["rtt"] as? Int ?? -1; let relay = item["relayRtt"] as? Int ?? -1
                let probe = item["probe"] as? Int ?? 0
                let latency = item["latency"] as? Int ?? -1
                let ping: NSView
                if probe == 1 {
                    let spinner = NSProgressIndicator(); spinner.style = .spinning; spinner.controlSize = .small
                    spinner.startAnimation(nil); ping = stack([spinner], horizontal: true)
                    ping.widthAnchor.constraint(equalToConstant: 40).isActive = true
                } else { ping = LatencyView(latency: latency, unreachable: probe == 3) }
                let tip = probe == 2 ? text("ProbeLatency", String(rtt)) : (probe == 3 && relay >= 0 ? text("ProbeRelayLatency", String(relay)) : (probe == 1 ? text("ProbeTesting") : nil))
                if let view = ping as? LatencyView { view.tip = tip } else { ping.toolTip = tip }
                let full = (item["playerCount"] as? Int ?? 0) >= (item["maxPlayers"] as? Int ?? 10)
                let action = button(text(full ? "Full" : "Join"), #selector(joinFromRow(_:))); action.tag = row; action.primary = true
                action.widthAnchor.constraint(equalToConstant: 62).isActive = true
                action.isEnabled = backendAvailable && !away && kind == 0 && !full && item["joinable"] as? Bool != false
                tail = stack([ping, action], horizontal: true, spacing: 8)
            }
            return roomColumns(name, map, count, tail)
        }
        let left = playerCard(row * 2)
        let right = row * 2 + 1 < playerRows.count ? playerCard(row * 2 + 1) : NSView()
        let pair = stack([left, right], horizontal: true, spacing: 8); pair.distribution = .fillEqually
        return pair
    }
    func playerCard(_ index: Int) -> NSView {
        let item = playerRows[index]; let name = item["name"] as? String ?? text("Player")
        let playerName = label(name, size: 12); playerName.lineBreakMode = .byTruncatingTail; playerName.toolTip = name
        playerName.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let nameLine = stack([playerName, label(item["host"] as? Bool == true ? text("TagHost") : "", size: 9), spacer()], horizontal: true, spacing: 4)
        let states = ["StatusConnecting", "StatusLoading", "StatusInGame", "StatusFailed", "StatusLeft", "StatusInRoom", "StatusWaiting"]
        let status = item["status"] as? Int ?? 0
        let key = status == 1 && item["host"] as? Bool == true ? "StatusHostLoading" : (states.indices.contains(status) ? states[status] : "StatusInRoom")
        let detail = label(text(key), size: 10); detail.lineBreakMode = .byTruncatingTail
        detail.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let dot = label("●", size: 10); dot.widthAnchor.constraint(equalToConstant: 8).isActive = true
        let loading = Theme.color(0x6aa9e9); let faint = Theme.color(0x7f756d)
        var ring: NSColor?
        switch status {
        case 0: dot.textColor = Theme.color(0xe5a93a); detail.textColor = dot.textColor; ring = dot.textColor
        case 1, 6: dot.textColor = loading; detail.textColor = Theme.color(0x9fc6ef); ring = loading
        case 2: dot.textColor = Theme.color(0x3fb67a); detail.textColor = Theme.muted
        case 3: dot.textColor = Theme.color(0xe5484d); detail.textColor = Theme.color(0xf0868a); playerName.textColor = Theme.muted
        case 4: dot.textColor = faint; detail.textColor = faint; playerName.textColor = faint
        default: dot.textColor = faint; detail.textColor = Theme.muted
        }
        let avatar = avatarView(item["avatarUrl"] as? String ?? "", name: name, size: 32)
        avatar.alphaValue = status == 0 ? 190.0 / 255 : (status == 3 ? 100.0 / 255 : (status == 4 ? 90.0 / 255 : 1))
        let portrait = NSView(); portrait.wantsLayer = true
        portrait.widthAnchor.constraint(equalToConstant: 38).isActive = true; portrait.heightAnchor.constraint(equalToConstant: 38).isActive = true
        avatar.translatesAutoresizingMaskIntoConstraints = false; portrait.addSubview(avatar)
        avatar.centerXAnchor.constraint(equalTo: portrait.centerXAnchor).isActive = true; avatar.centerYAnchor.constraint(equalTo: portrait.centerYAnchor).isActive = true
        if let ring = ring {
            let outline = CAShapeLayer(); outline.path = CGPath(ellipseIn: CGRect(x: 1, y: 1, width: 36, height: 36), transform: nil)
            outline.fillColor = nil; outline.strokeColor = ring.cgColor; outline.lineWidth = 2
            if status == 0 { outline.lineDashPattern = [2, 3] }
            portrait.layer?.addSublayer(outline)
        }
        let card = stack([portrait, stack([nameLine, stack([dot, detail, spacer()], horizontal: true, spacing: 4)], spacing: 3)], horizontal: true, spacing: 6)
        if sessionRole == "host" && item["host"] as? Bool != true {
            let kick = button("×", #selector(kickPlayer(_:))); kick.tag = index; kick.link = true
            kick.toolTip = text("Kick"); kick.setAccessibilityLabel(text("Kick")); kick.widthAnchor.constraint(equalToConstant: 18).isActive = true
            card.addArrangedSubview(kick)
        }
        card.edgeInsets = NSEdgeInsets(top: 6, left: 8, bottom: 6, right: 8)
        card.wantsLayer = true; card.layer?.backgroundColor = Theme.color(0x2a2420).cgColor; card.layer?.cornerRadius = 5
        return card
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
        return nil
    }
    @objc func showFeedback() {
        if let window = feedbackWindow { window.makeKeyAndOrderFront(nil); return }
        let sheet = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 500, height: 450), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        sheet.backgroundColor = Theme.background; sheet.title = text("FeedbackTitle"); sheet.isReleasedWhenClosed = false; sheet.center()
        let root = stack([], spacing: 10); root.translatesAutoresizingMaskIntoConstraints = false; sheet.contentView!.addSubview(root)
        NSLayoutConstraint.activate([root.leadingAnchor.constraint(equalTo: sheet.contentView!.leadingAnchor, constant: 20), root.trailingAnchor.constraint(equalTo: sheet.contentView!.trailingAnchor, constant: -20), root.topAnchor.constraint(equalTo: sheet.contentView!.topAnchor, constant: 20)])
        let kind = segments([text("TypeProblem"), text("TypeSuggestion")]); kind.heightAnchor.constraint(equalToConstant: 34).isActive = true
        kind.selectedSegment = 0; kind.target = self; kind.action = #selector(feedbackKindChanged)
        feedbackType = kind; root.addArrangedSubview(kind)
        root.addArrangedSubview(stack([label(text("RelatedTo"), size: 11, weight: .semibold), spacer(), label(text("UpToTwo"), size: 10)], horizontal: true))
        let keys = ["TopicHero", "TopicAbility", "TopicAwakening", "TopicItem", "TopicBot", "TopicBalance", "TopicUI", "TopicMembership", "TopicLag", "TopicLauncher", "TopicWebsite"]
        feedbackTopics = keys.enumerated().map { index, key in
            let view = button(text(key), #selector(topicChanged(_:))); view.setButtonType(.pushOnPushOff); view.pill = true
            view.font = .systemFont(ofSize: 11); view.tag = index; view.heightAnchor.constraint(equalToConstant: 26).isActive = true
            return view
        }
        var row = stack([], horizontal: true, spacing: 6); var width: CGFloat = 0
        for view in feedbackTopics {
            let next = view.intrinsicContentSize.width
            if width + next > 460 { row.addArrangedSubview(spacer()); root.addArrangedSubview(row); row = stack([], horizontal: true, spacing: 6); width = 0 }
            row.addArrangedSubview(view); width += next + 6
        }
        row.addArrangedSubview(spacer()); root.addArrangedSubview(row)
        root.addArrangedSubview(label(text("Description"), size: 11, weight: .semibold))
        let description = DescriptionView(); description.font = .systemFont(ofSize: 12); description.isRichText = false; description.delegate = self
        description.backgroundColor = Theme.panel; description.textColor = Theme.text; feedbackDescription = description
        let scroll = NSScrollView(); scroll.hasVerticalScroller = true; scroll.borderType = .bezelBorder; scroll.documentView = description
        description.isVerticallyResizable = true; description.autoresizingMask = [.width]; description.textContainer?.widthTracksTextView = true
        description.textContainerInset = NSSize(width: 6, height: 6)
        scroll.heightAnchor.constraint(equalToConstant: 116).isActive = true; root.addArrangedSubview(scroll)
        let attach = NSButton(checkboxWithTitle: text("AttachLog"), target: nil, action: nil); attach.state = .on; attach.font = .systemFont(ofSize: 11); attach.toolTip = text("AttachLogHint")
        feedbackLog = attach
        let attachHint = label(text("AttachLogHint"), size: 10); attachHint.textColor = Theme.muted; attachHint.lineBreakMode = .byTruncatingTail; attachHint.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        root.addArrangedSubview(stack([attach, attachHint, spacer()], horizontal: true, spacing: 8))
        let note = label(text("PrivacyNote"), size: 9); note.textColor = Theme.muted
        let privacy = button(text("PrivacyLink"), #selector(openPrivacy)); privacy.link = true; privacy.underlined = true; privacy.font = .systemFont(ofSize: 9)
        let policy = stack([note, privacy], horizontal: languageCode != "ru-RU", spacing: 0)
        let cancel = button(text("Cancel"), #selector(closeFeedback)); cancel.keyEquivalent = "\u{1b}"
        let send = button(text("Send"), #selector(submitFeedback)); send.primary = true; feedbackSend = send
        let actions = stack([policy, spacer(), cancel, send], horizontal: true, spacing: 8)
        actions.translatesAutoresizingMaskIntoConstraints = false; sheet.contentView!.addSubview(actions)
        NSLayoutConstraint.activate([
            actions.leadingAnchor.constraint(equalTo: sheet.contentView!.leadingAnchor, constant: 20),
            actions.trailingAnchor.constraint(equalTo: sheet.contentView!.trailingAnchor, constant: -20),
            actions.bottomAnchor.constraint(equalTo: sheet.contentView!.bottomAnchor, constant: -20),
            root.bottomAnchor.constraint(lessThanOrEqualTo: actions.topAnchor, constant: -20)
        ])
        for view in root.arrangedSubviews { view.widthAnchor.constraint(equalTo: root.widthAnchor).isActive = true }
        feedbackWindow = sheet; feedbackKindChanged(); sheet.contentView?.layoutSubtreeIfNeeded()
        sheet.setContentSize(NSSize(width: 500, height: max(430, root.fittingSize.height + actions.fittingSize.height + 60)))
        if option("--screenshot") == nil { sheet.makeKeyAndOrderFront(nil) }
    }
    @objc func closeFeedback() { feedbackWindow?.close() }
    @objc func feedbackKindChanged() {
        let cue = text(feedbackType?.selectedSegment == 1 ? "SuggestionCue" : "ProblemCue")
        feedbackDescription?.toolTip = cue; (feedbackDescription as? DescriptionView)?.placeholder = cue
    }
    func textDidChange(_ notification: Notification) {
        if let description = feedbackDescription, description.string.count > 1000 { description.string = String(description.string.prefix(1000)) }
        feedbackDescription?.needsDisplay = true
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
        mapState = "ready"; setBadge(1)
        switch option("--preview-state") ?? "idle" {
        case "host-idle": pages.selectedSegment = 1
        case "host-starting":
            pages.selectedSegment = 1
            handle(["type": "state", "role": "host", "state": "loading", "code": "4ZZZMP", "message": text("Starting")])
            handle(["type": "roster", "players": [["key": "host", "name": "Konosuba", "host": true, "status": 1]]])
        case "host", "join", "ended":
            let mode = option("--preview-state")!; let role = mode == "ended" ? "host" : mode; pages.selectedSegment = role == "host" ? 1 : 2
            handle(["type": "state", "role": role, "state": mode == "ended" ? "ended" : "ready", "code": "Z82QCT", "message": text(mode == "ended" ? "GameEnded" : "HostGuide")])
            handle(["type": "roster", "players": [["key": "host", "name": "Windy", "host": true, "status": 2], ["key": "guest", "name": "Player", "status": 5]]])
        case "join-checking", "join-waiting", "join-ready", "join-playing", "join-ended", "join-error", "join-left":
            pages.selectedSegment = 2
            let state = String(option("--preview-state")!.dropFirst(5))
            let nextState = state == "left" ? "idle" : state
            let message = ["checking": "Starting", "waiting": "StatusWaiting", "ready": "EnterGame", "playing": "EnterGame", "ended": "GameEnded", "error": "BackendExited", "idle": "JoinGuide"][nextState] ?? "JoinGuide"
            handle(["type": "state", "role": "join", "state": nextState, "code": ["idle", "error"].contains(nextState) ? "" : "Z82QCT", "message": text(message)])
            if active {
                handle(["type": "roster", "players": [["key": "host", "name": "Windy", "host": true, "status": 2], ["key": "guest", "name": "Player", "status": 5]]])
                handle(["type": "route", "message": text("RouteQuality", text("RouteRelay"), "30", "0")])
            }
        case "rooms":
            pages.selectedSegment = 2
            handle(["type": "rooms", "rows": [["code": "Z82QCT", "name": "Windy", "map": "easy", "playerCount": 3, "maxPlayers": 10, "rtt": 32, "probe": 2, "latency": 32, "kind": 0, "avatars": [["name": "Windy"], ["name": "Player"]]], ["code": "ABC123", "name": "Player", "map": "hard", "playerCount": 2, "maxPlayers": 6, "kind": 1, "minutes": 24, "avatars": [["name": "Player"], ["name": "Windy"]]]]])
        case "missing": mapState = "missing"
        case "outdated": pages.selectedSegment = 1; mapState = "outdated"
        case "error": state = "error"; status.stringValue = text("BackendExited"); status.textColor = .systemRed
        case "feedback": showFeedback()
        case "update": handle(["type": "release", "available": true, "version": "1.0.0"])
        default: break
        }
        if option("--preview-auto-enter") == "off" { autoEnter.state = .off }
        if option("--preview-auto-start") == "off" { autoStart.state = .off }
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
