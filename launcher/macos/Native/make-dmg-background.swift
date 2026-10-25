// 生成 DMG 窗口背景（1x 与 2x 合成一张 tiff）：swift Native/make-dmg-background.swift <输出目录>
import AppKit

let output = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")
let size = NSSize(width: 660, height: 400)
let lines = ["拖到「应用程序」，然后在启动台打开 Windy10v10AI", "Drag to Applications, then open it from Launchpad"]

// 取自启动器界面的配色
extension NSColor {
    convenience init(hex: UInt32) { self.init(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1) }
}

func render(scale: CGFloat) -> Data {
    let pixels = NSSize(width: size.width * scale, height: size.height * scale)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(pixels.width), pixelsHigh: Int(pixels.height), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = size
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGradient(starting: NSColor(hex: 0x211d1a), ending: NSColor(hex: 0x161412))!.draw(in: NSRect(origin: .zero, size: size), angle: -90)
    // 箭头落在两个图标之间的水平线上
    let accent = NSColor(hex: 0xe0552d)
    accent.setStroke(); accent.setFill()
    let shaft = NSBezierPath(); shaft.lineWidth = 6; shaft.lineCapStyle = .round
    shaft.move(to: NSPoint(x: 270, y: 210)); shaft.line(to: NSPoint(x: 380, y: 210)); shaft.stroke()
    let head = NSBezierPath()
    head.move(to: NSPoint(x: 372, y: 232)); head.line(to: NSPoint(x: 402, y: 210)); head.line(to: NSPoint(x: 372, y: 188)); head.close(); head.fill()
    // Finder 图标名字的颜色随系统外观在黑白间切换，垫一块中灰底板让两种都看得清
    NSColor(hex: 0x857e77).setFill()
    for x in [CGFloat(180), 480] { NSBezierPath(roundedRect: NSRect(x: x - 78, y: 112, width: 156, height: 26), xRadius: 6, yRadius: 6).fill() }
    for (index, line) in lines.enumerated() {
        let style = NSMutableParagraphStyle(); style.alignment = .center
        let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: index == 0 ? 15 : 12, weight: index == 0 ? .semibold : .regular), .foregroundColor: NSColor(hex: index == 0 ? 0xeee7e0 : 0xaca198), .paragraphStyle: style]
        NSAttributedString(string: line, attributes: attributes).draw(in: NSRect(x: 0, y: 52 - CGFloat(index) * 24, width: size.width, height: 22))
    }
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

try render(scale: 1).write(to: output.appendingPathComponent("dmg-background.png"))
try render(scale: 2).write(to: output.appendingPathComponent("dmg-background@2x.png"))
