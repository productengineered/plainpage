// Renders build/icon.svg to a transparent PNG at any size (NSImage reads SVG).
//   swift scripts/render-icon.swift build/icon.svg build/icon.png 1024
// For build/icon.icns: render 16–1024 into a .iconset inside the repo, then
// `iconutil -c icns <dir>.iconset -o build/icon.icns`.
import AppKit
let args = CommandLine.arguments
guard let img = NSImage(contentsOf: URL(fileURLWithPath: args[1])) else { fatalError("load") }
let size = Int(args[3])!
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor.clear.set(); NSRect(x: 0, y: 0, width: size, height: size).fill()
img.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
NSGraphicsContext.restoreGraphicsState()
let c = rep.colorAt(x: 5, y: 5)!
FileHandle.standardError.write("corner alpha \(c.alphaComponent)\n".data(using: .utf8)!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
