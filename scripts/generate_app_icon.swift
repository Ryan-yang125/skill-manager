import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let resources = root.appendingPathComponent("Sources/SkillManagerApp/Resources", isDirectory: true)
let workDirectory = root.appendingPathComponent("build/IconGeneration", isDirectory: true)
let iconset = workDirectory.appendingPathComponent("AppIcon.iconset", isDirectory: true)
try? FileManager.default.removeItem(at: iconset)
try FileManager.default.createDirectory(at: resources, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

let sizes: [(name: String, points: CGFloat, scale: CGFloat)] = [
    ("icon_16x16.png", 16, 1),
    ("icon_16x16@2x.png", 16, 2),
    ("icon_32x32.png", 32, 1),
    ("icon_32x32@2x.png", 32, 2),
    ("icon_128x128.png", 128, 1),
    ("icon_128x128@2x.png", 128, 2),
    ("icon_256x256.png", 256, 1),
    ("icon_256x256@2x.png", 256, 2),
    ("icon_512x512.png", 512, 1),
    ("icon_512x512@2x.png", 512, 2)
]

for size in sizes {
    let pixels = Int(size.points * size.scale)
    let image = drawIcon(size: CGFloat(pixels))
    let url = iconset.appendingPathComponent(size.name)
    try writePNG(image, to: url)
}

let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = [
    "-c", "icns",
    iconset.path,
    "-o", resources.appendingPathComponent("AppIcon.icns").path
]
try process.run()
process.waitUntilExit()
guard process.terminationStatus == 0 else {
    throw NSError(domain: "IconGeneration", code: Int(process.terminationStatus))
}

func drawIcon(size: CGFloat) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    defer { image.unlockFocus() }

    let rect = CGRect(x: 0, y: 0, width: size, height: size)
    let scale = size / 1024
    let radius = 230 * scale

    NSGraphicsContext.current?.imageInterpolation = .high
    NSGraphicsContext.current?.shouldAntialias = true

    let baseRect = rect.insetBy(dx: 54 * scale, dy: 54 * scale)
    let base = NSBezierPath(roundedRect: baseRect, xRadius: radius, yRadius: radius)
    let gradient = NSGradient(colors: [
        NSColor(calibratedRed: 0.86, green: 0.98, blue: 0.96, alpha: 1),
        NSColor(calibratedRed: 0.98, green: 0.95, blue: 0.82, alpha: 1),
        NSColor(calibratedRed: 0.84, green: 0.94, blue: 1.00, alpha: 1)
    ])!
    gradient.draw(in: base, angle: -42)

    NSColor(calibratedWhite: 1, alpha: 0.58).setStroke()
    base.lineWidth = 18 * scale
    base.stroke()

    addSoftEllipse(
        rect: CGRect(x: 132 * scale, y: 642 * scale, width: 424 * scale, height: 272 * scale),
        color: NSColor(calibratedWhite: 1, alpha: 0.42)
    )
    addSoftEllipse(
        rect: CGRect(x: 520 * scale, y: 124 * scale, width: 340 * scale, height: 270 * scale),
        color: NSColor(calibratedRed: 0.20, green: 0.80, blue: 0.90, alpha: 0.18)
    )

    drawGlassWindow(scale: scale)
    drawSidebar(scale: scale)
    drawSkillCards(scale: scale)
    drawScanRing(scale: scale)
    drawSpark(scale: scale)

    return image
}

func drawGlassWindow(scale: CGFloat) {
    let shadow = NSShadow()
    shadow.shadowColor = NSColor(calibratedWhite: 0, alpha: 0.14)
    shadow.shadowBlurRadius = 48 * scale
    shadow.shadowOffset = CGSize(width: 0, height: -20 * scale)
    shadow.set()

    let window = NSBezierPath(
        roundedRect: CGRect(x: 176 * scale, y: 190 * scale, width: 672 * scale, height: 650 * scale),
        xRadius: 92 * scale,
        yRadius: 92 * scale
    )
    NSColor(calibratedWhite: 1, alpha: 0.62).setFill()
    window.fill()
    shadow.shadowColor = .clear
    shadow.set()

    NSColor(calibratedWhite: 1, alpha: 0.76).setStroke()
    window.lineWidth = 10 * scale
    window.stroke()
}

func drawSidebar(scale: CGFloat) {
    let sidebar = NSBezierPath(
        roundedRect: CGRect(x: 216 * scale, y: 242 * scale, width: 158 * scale, height: 546 * scale),
        xRadius: 52 * scale,
        yRadius: 52 * scale
    )
    NSColor(calibratedRed: 0.90, green: 0.97, blue: 0.94, alpha: 0.72).setFill()
    sidebar.fill()

    let selected = NSBezierPath(
        roundedRect: CGRect(x: 244 * scale, y: 648 * scale, width: 102 * scale, height: 56 * scale),
        xRadius: 28 * scale,
        yRadius: 28 * scale
    )
    NSColor(calibratedWhite: 1, alpha: 0.72).setFill()
    selected.fill()

    let dotColor = NSColor(calibratedRed: 0.02, green: 0.55, blue: 0.65, alpha: 0.76)
    for y in [668, 574, 498, 422] {
        dotColor.setFill()
        NSBezierPath(ovalIn: CGRect(x: 268 * scale, y: CGFloat(y) * scale, width: 20 * scale, height: 20 * scale)).fill()
        drawRoundedLine(
            from: CGPoint(x: 304 * scale, y: (CGFloat(y) + 10) * scale),
            to: CGPoint(x: 334 * scale, y: (CGFloat(y) + 10) * scale),
            width: 12 * scale,
            color: NSColor(calibratedRed: 0.22, green: 0.28, blue: 0.34, alpha: 0.22)
        )
    }
}

func drawSkillCards(scale: CGFloat) {
    drawCard(
        rect: CGRect(x: 470 * scale, y: 560 * scale, width: 250 * scale, height: 156 * scale),
        radius: 34 * scale,
        fill: NSColor(calibratedWhite: 1, alpha: 0.88),
        stroke: NSColor(calibratedWhite: 1, alpha: 0.72),
        shadowAlpha: 0.11,
        rotation: -4,
        scale: scale
    )
    drawCard(
        rect: CGRect(x: 444 * scale, y: 372 * scale, width: 320 * scale, height: 226 * scale),
        radius: 44 * scale,
        fill: NSColor(calibratedWhite: 1, alpha: 0.96),
        stroke: NSColor(calibratedRed: 0.22, green: 0.78, blue: 0.88, alpha: 0.80),
        shadowAlpha: 0.18,
        rotation: 0,
        scale: scale
    )

    let lineColor = NSColor(calibratedRed: 0.21, green: 0.28, blue: 0.35, alpha: 0.28)
    for y in [438, 486, 534] {
        drawRoundedLine(
            from: CGPoint(x: 500 * scale, y: CGFloat(y) * scale),
            to: CGPoint(x: 706 * scale, y: CGFloat(y) * scale),
            width: 16 * scale,
            color: lineColor
        )
    }
    NSColor(calibratedRed: 0.04, green: 0.62, blue: 0.72, alpha: 0.82).setFill()
    NSBezierPath(ovalIn: CGRect(x: 492 * scale, y: 648 * scale, width: 28 * scale, height: 28 * scale)).fill()
    drawRoundedLine(
        from: CGPoint(x: 538 * scale, y: 662 * scale),
        to: CGPoint(x: 666 * scale, y: 662 * scale),
        width: 18 * scale,
        color: NSColor(calibratedRed: 0.21, green: 0.28, blue: 0.35, alpha: 0.24)
    )
}

func drawCard(rect: CGRect, radius: CGFloat, fill: NSColor, stroke: NSColor, shadowAlpha: CGFloat, rotation: CGFloat, scale: CGFloat) {
    NSGraphicsContext.saveGraphicsState()
    let transform = NSAffineTransform()
    transform.translateX(by: rect.midX, yBy: rect.midY)
    transform.rotate(byDegrees: rotation)
    transform.translateX(by: -rect.midX, yBy: -rect.midY)
    transform.concat()

    let shadow = NSShadow()
    shadow.shadowColor = NSColor(calibratedWhite: 0, alpha: shadowAlpha)
    shadow.shadowBlurRadius = 34 * scale
    shadow.shadowOffset = CGSize(width: 0, height: -14 * scale)
    shadow.set()

    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    fill.setFill()
    path.fill()
    shadow.shadowColor = .clear
    shadow.set()
    stroke.setStroke()
    path.lineWidth = 8 * scale
    path.stroke()

    NSGraphicsContext.restoreGraphicsState()
}

func drawScanRing(scale: CGFloat) {
    let center = CGPoint(x: 572 * scale, y: 520 * scale)
    let ringRect = CGRect(x: center.x - 144 * scale, y: center.y - 144 * scale, width: 288 * scale, height: 288 * scale)
    let ring = NSBezierPath(ovalIn: ringRect)
    NSColor(calibratedRed: 0.08, green: 0.72, blue: 0.82, alpha: 0.12).setFill()
    ring.fill()
    NSColor(calibratedRed: 0.02, green: 0.56, blue: 0.66, alpha: 1).setStroke()
    ring.lineWidth = 32 * scale
    ring.stroke()

    let handle = NSBezierPath()
    handle.move(to: CGPoint(x: 678 * scale, y: 414 * scale))
    handle.line(to: CGPoint(x: 748 * scale, y: 344 * scale))
    handle.lineCapStyle = .round
    NSColor(calibratedRed: 0.02, green: 0.56, blue: 0.66, alpha: 1).setStroke()
    handle.lineWidth = 36 * scale
    handle.stroke()
}

func drawSpark(scale: CGFloat) {
    let center = CGPoint(x: 570 * scale, y: 520 * scale)
    let path = NSBezierPath()
    path.move(to: CGPoint(x: center.x, y: center.y + 54 * scale))
    path.curve(to: CGPoint(x: center.x + 54 * scale, y: center.y), controlPoint1: CGPoint(x: center.x + 12 * scale, y: center.y + 18 * scale), controlPoint2: CGPoint(x: center.x + 38 * scale, y: center.y + 12 * scale))
    path.curve(to: CGPoint(x: center.x, y: center.y - 54 * scale), controlPoint1: CGPoint(x: center.x + 22 * scale, y: center.y - 10 * scale), controlPoint2: CGPoint(x: center.x + 10 * scale, y: center.y - 30 * scale))
    path.curve(to: CGPoint(x: center.x - 54 * scale, y: center.y), controlPoint1: CGPoint(x: center.x - 10 * scale, y: center.y - 30 * scale), controlPoint2: CGPoint(x: center.x - 22 * scale, y: center.y - 10 * scale))
    path.curve(to: CGPoint(x: center.x, y: center.y + 54 * scale), controlPoint1: CGPoint(x: center.x - 38 * scale, y: center.y + 12 * scale), controlPoint2: CGPoint(x: center.x - 12 * scale, y: center.y + 18 * scale))
    NSColor(calibratedRed: 0.08, green: 0.10, blue: 0.12, alpha: 0.90).setFill()
    path.fill()
}

func addSoftEllipse(rect: CGRect, color: NSColor) {
    color.setFill()
    NSBezierPath(ovalIn: rect).fill()
}

func drawRoundedLine(from: CGPoint, to: CGPoint, width: CGFloat, color: NSColor) {
    let path = NSBezierPath()
    path.move(to: from)
    path.line(to: to)
    path.lineCapStyle = .round
    color.setStroke()
    path.lineWidth = width
    path.stroke()
}

func writePNG(_ image: NSImage, to url: URL) throws {
    guard
        let tiff = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: tiff),
        let data = bitmap.representation(using: .png, properties: [:])
    else {
        throw NSError(domain: "IconGeneration", code: 1)
    }
    try data.write(to: url)
}
