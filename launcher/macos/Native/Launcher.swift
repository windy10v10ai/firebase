// GPL-3.0.
import Cocoa

final class Launcher: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var engine: Process?
    var input: Pipe?
    var pending = Data()
    var closing = false
    var active = false
    var code = ""
    var logPath = ""
    let mode = NSPopUpButton()
    let count = NSPopUpButton()
    let autoEnter = NSButton(checkboxWithTitle: "开房后自动进入 Dota 2", target: nil, action: nil)
    let room = NSTextField(labelWithString: "尚未开房")
    let status = NSTextField(wrappingLabelWithString: "正在检查本机环境…")
    let details = NSTextField(wrappingLabelWithString: "朋友使用 Windows 启动器，输入房间码加入。")
    let start = NSButton(title: "创建房间", target: nil, action: nil)
    let enter = NSButton(title: "进入游戏", target: nil, action: nil)
    let nextGame = NSButton(title: "启动下一局", target: nil, action: nil)
    let copyCode = NSButton(title: "复制房间码", target: nil, action: nil)
    let updateMap = NSButton(title: "更新地图", target: nil, action: nil)
    let progress = NSProgressIndicator()
    let roster = NSTextView()
    let journal = NSTextView()

    func label(_ text: String, size: CGFloat = 13, weight: NSFont.Weight = .regular) -> NSTextField {
        let l = NSTextField(labelWithString: text); l.font = .systemFont(ofSize: size, weight: weight); return l
    }
    func row(_ views: [NSView], spacing: CGFloat = 10) -> NSStackView {
        let s = NSStackView(views: views); s.orientation = .horizontal; s.alignment = .centerY; s.spacing = spacing; return s
    }
    func spacer() -> NSView { let v = NSView(); v.setContentHuggingPriority(.defaultLow, for: .horizontal); return v }
    func configure(_ button: NSButton, _ action: Selector) {button.target=self;button.action=action;button.bezelStyle = .rounded}
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        window = NSWindow(contentRect: NSRect(x:0,y:0,width:640,height:720),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title = "Windy 10v10 · Mac 启动器"
        window.minSize = NSSize(width:600,height:700)
        window.center()
        let root = NSStackView(); root.orientation = .vertical; root.alignment = .leading; root.spacing = 18
        root.translatesAutoresizingMaskIntoConstraints=false
        window.contentView!.addSubview(root)
        NSLayoutConstraint.activate([root.leadingAnchor.constraint(equalTo:window.contentView!.leadingAnchor,constant:28),root.trailingAnchor.constraint(equalTo:window.contentView!.trailingAnchor,constant:-28),root.topAnchor.constraint(equalTo:window.contentView!.topAnchor,constant:26),root.bottomAnchor.constraint(equalTo:window.contentView!.bottomAnchor,constant:-24)])
        let title = label("用 Mac 开房，和朋友一起玩", size:24, weight:.semibold)
        root.addArrangedSubview(title)
        details.textColor = .secondaryLabelColor;details.font = .systemFont(ofSize:13)
        root.addArrangedSubview(details)
        mode.addItems(withTitles:["普通","困难","自定义"])
        count.addItems(withTitles:(2...10).map{"\($0) 人"});count.selectItem(at:8)
        mode.setAccessibilityLabel("地图难度");count.setAccessibilityLabel("房间人数上限")
        let settings = row([label("难度"),mode,spacer(),label("人数上限"),count])
        root.addArrangedSubview(settings)
        autoEnter.state = .on;root.addArrangedSubview(autoEnter)
        let line = NSBox();line.boxType = .separator;root.addArrangedSubview(line)
        room.font = .monospacedSystemFont(ofSize:30,weight:.medium);room.isSelectable = true
        configure(copyCode,#selector(copyRoom));copyCode.isEnabled=false
        root.addArrangedSubview(row([room,spacer(),copyCode]))
        status.font = .systemFont(ofSize:14,weight:.medium);status.maximumNumberOfLines=3
        progress.style = .spinning;progress.controlSize = .small;progress.isDisplayedWhenStopped=false
        root.addArrangedSubview(row([progress,status]))
        configure(start,#selector(toggleRoom));start.keyEquivalent="\r"
        configure(enter,#selector(enterRoom));enter.isEnabled=false
        configure(nextGame,#selector(nextRoom));nextGame.isEnabled=false
        root.addArrangedSubview(row([start,enter,nextGame,spacer()]))
        roster.font = .systemFont(ofSize:13);roster.string="开房后在这里查看玩家连接状态。";roster.isEditable=false;roster.isSelectable=true
        roster.isVerticallyResizable=true;roster.isHorizontallyResizable=false;roster.autoresizingMask=[.width];roster.textContainer?.widthTracksTextView=true;roster.textContainerInset=NSSize(width:8,height:6)
        let rosterScroll=NSScrollView();rosterScroll.hasVerticalScroller=true;rosterScroll.borderType = .bezelBorder;rosterScroll.documentView=roster
        root.addArrangedSubview(rosterScroll);rosterScroll.heightAnchor.constraint(equalToConstant:72).isActive=true
        root.addArrangedSubview(label("运行记录",size:13,weight:.semibold))
        let scroll = NSScrollView();scroll.hasVerticalScroller=true;scroll.borderType = .bezelBorder
        journal.isEditable=false;journal.isSelectable=true;journal.font = .systemFont(ofSize:12);journal.textContainerInset=NSSize(width:10,height:10)
        journal.autoresizingMask=[.width];journal.isVerticallyResizable=true;journal.isHorizontallyResizable=false
        journal.textContainer?.widthTracksTextView=true;scroll.documentView=journal
        root.addArrangedSubview(scroll);scroll.heightAnchor.constraint(greaterThanOrEqualToConstant:110).isActive=true
        scroll.setContentHuggingPriority(.defaultLow,for:.vertical)
        let logs = NSButton(title:"打开日志文件夹",target:self,action:#selector(openLogs));logs.bezelStyle = .rounded
        let command = NSButton(title:"复制连接命令",target:self,action:#selector(copyConnect));command.bezelStyle = .rounded
        configure(updateMap,#selector(updateWorkshop))
        root.addArrangedSubview(row([logs,command,spacer(),updateMap]))
        let footer=label("非官方 Mac 测试版 · 协议 3 · 仅创建私密房间",size:11);footer.textColor = .secondaryLabelColor;root.addArrangedSubview(footer)
        for view in root.arrangedSubviews {view.widthAnchor.constraint(equalTo:root.widthAnchor).isActive=true}
        window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
        buildMenu();launchEngine()
    }
    func buildMenu() {
        let menu=NSMenu();let item=NSMenuItem();menu.addItem(item);let appMenu=NSMenu();item.submenu=appMenu
        appMenu.addItem(withTitle:"关于 WindyMac",action:#selector(about),keyEquivalent:"")
        appMenu.addItem(.separator());appMenu.addItem(withTitle:"退出 WindyMac",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        let edit=NSMenuItem();edit.title="编辑";menu.addItem(edit);let e=NSMenu(title:"编辑");edit.submenu=e
        e.addItem(withTitle:"复制",action:#selector(NSText.copy(_:)),keyEquivalent:"c")
        e.addItem(withTitle:"全选",action:#selector(NSText.selectAll(_:)),keyEquivalent:"a")
        NSApp.mainMenu=menu
    }
    func launchEngine() {
        let path=Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/engine/WindyMacEngine")
        let p=Process();p.executableURL=path
        let i=Pipe(),o=Pipe(),err=Pipe();input=i;p.standardInput=i;p.standardOutput=o;p.standardError=err
        o.fileHandleForReading.readabilityHandler = { [weak self] file in
            let data=file.availableData;if data.isEmpty{return}
            DispatchQueue.main.async {self?.consume(data)}
        }
        err.fileHandleForReading.readabilityHandler = { [weak self] file in
            let d=file.availableData;if let s=String(data:d,encoding:.utf8),!s.isEmpty {DispatchQueue.main.async {self?.append(s)}}
        }
        p.terminationHandler = { [weak self] _ in DispatchQueue.main.async {
            guard let self=self else{return}
            if self.closing {NSApp.reply(toApplicationShouldTerminate:true)}
            else {self.backendFailed("启动器服务已退出，请重新打开应用。")}
        }}
        engine=p
        do {try p.run();send(["action":"inspect"])} catch {backendFailed("无法启动服务，请重新打开应用：\(error.localizedDescription)")}
    }
    func backendFailed(_ message:String) {
        active=false;code="";room.stringValue="尚未开房";roster.string="服务已退出，房间状态无法继续更新。"
        start.isEnabled=false;enter.isEnabled=false;nextGame.isEnabled=false;copyCode.isEnabled=false;updateMap.isEnabled=false
        status.stringValue=message;status.textColor = .systemRed;progress.stopAnimation(nil);append(message)
    }
    func send(_ command:[String:Any]) {
        do {var data=try JSONSerialization.data(withJSONObject:command);data.append(0x0a);try input?.fileHandleForWriting.write(contentsOf:data)}catch{append("发送操作失败：\(error.localizedDescription)")}
    }
    func consume(_ data:Data) {
        pending.append(data)
        while let at=pending.firstIndex(of:0x0a) {
            let line=pending.prefix(upTo:at);pending.removeSubrange(...at)
            guard let event=(try? JSONSerialization.jsonObject(with:line)) as? [String:Any] else {continue}
            let type=event["type"] as? String ?? ""
            if type=="state" {
                let state=event["state"] as? String ?? "idle"
                let message=event["message"] as? String ?? ""
                status.stringValue=message;status.textColor=state=="error" ? .systemRed : .labelColor;append(message)
                code=event["code"] as? String ?? "";room.stringValue=code.isEmpty ? "尚未开房" : code
                if let l=event["log"] as? String,!l.isEmpty {logPath=l}
                active = !["idle","error"].contains(state)
                let loading=["checking","opening","loading","stopping","saving","updating"].contains(state)
                if loading {progress.startAnimation(nil)}else{progress.stopAnimation(nil)}
                copyCode.isEnabled = !code.isEmpty && active
                start.title = state=="updating" ? "更新中…" : (active ? "关闭房间" : "创建房间");start.isEnabled = !["stopping","updating"].contains(state)
                updateMap.isEnabled = !active
                mode.isEnabled = !active || state=="ended";count.isEnabled = !active;autoEnter.isEnabled = !active
                enter.isEnabled=["ready","playing"].contains(state);nextGame.isEnabled=state=="ended"
                if !active {room.stringValue="尚未开房";roster.string="开房后在这里查看玩家连接状态。"}
            }else if type=="message" {append(event["message"] as? String ?? "")}
            else if type=="roster",let players=event["players"] as? [[String:Any]] {
                let states=["连接中","加载中","游戏中","连接失败","已离开","在房间里","等待下一局"]
                roster.string=players.map {p in
                    let n=p["name"] as? String ?? "玩家",s=p["status"] as? Int ?? 0
                    return "\(p["host"] as? Bool == true ? "房主 · " : "")\(n)  \(states.indices.contains(s) ? states[s] : "游戏中")"
                }.joined(separator:"\n")
            }else if type=="inspection" {append("已找到 Mac 版 Dota 2 和地图。双方请保持 Steam 和地图更新。")}
        }
    }
    func append(_ text:String) {
        guard !text.isEmpty else{return}
        let formatter=DateFormatter();formatter.dateFormat="HH:mm:ss"
        let a=NSAttributedString(string:"\(formatter.string(from:Date()))  \(text)\n",attributes:[.font:NSFont.systemFont(ofSize:12),.foregroundColor:NSColor.labelColor])
        journal.textStorage?.append(a)
        if journal.string.count>50000 {journal.textStorage?.deleteCharacters(in:NSRange(location:0,length:10000))}
        journal.scrollToEndOfDocument(nil)
    }
    var selectedMode:String {["easy","hard","custom"][max(0,mode.indexOfSelectedItem)]}
    @objc func toggleRoom() {if active {send(["action":"stop"])}else{start.isEnabled=false;send(["action":"open","mode":selectedMode,"maxPlayers":count.indexOfSelectedItem+2,"autoEnter":autoEnter.state == .on])}}
    @objc func updateWorkshop() {send(["action":"update"])}
    @objc func enterRoom() {send(["action":"enter"])}
    @objc func nextRoom() {nextGame.isEnabled=false;send(["action":"next","mode":selectedMode])}
    func copy(_ text:String) {NSPasteboard.general.clearContents();NSPasteboard.general.setString(text,forType:.string)}
    @objc func copyRoom() {copy(code);append("已复制房间码，让朋友在 Windows 启动器里加入。")}
    @objc func copyConnect() {copy("connect 127.0.0.1:27016");append("已复制连接命令。若 Steam 未能自动进入，在 Dota 控制台粘贴执行。")}
    @objc func openLogs() {
        let path=NSHomeDirectory()+"/Library/Logs/WindyMac"
        if FileManager.default.fileExists(atPath:path){NSWorkspace.shared.open(URL(fileURLWithPath:path))}else{append("开房后会生成服务器日志。")}
    }
    @objc func about() {let a=NSAlert();a.messageText="WindyMac 0.1.1";a.informativeText="非官方 macOS 移植版，兼容 Windy10v10AI 协议 3。基于 windy 及贡献者的 GPL-3.0 开源代码。完整源码和许可证随交付包提供。";a.runModal()}
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool {true}
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply {
        if let p=engine,p.isRunning {closing=true;send(["action":"quit"]);return .terminateLater}
        return .terminateNow
    }
}
let app=NSApplication.shared
let delegate=Launcher()
app.delegate=delegate
app.run()
