#!/usr/bin/env swift
// 中文 OCR —— 用 macOS Vision 框架识别 PDF 页面文字，**输出带坐标**。
//
// 用途：给「没有文字层」的扫描版 PDF 补一个结构化文字层
//      （章节、考点、例题编号 + 每个文本块的位置）。
//      正文内容不依赖 OCR —— 界面上一律显示原书图片，
//      OCR 只用来定位结构与切分点。
//
// 编译：
//   swiftc -O ocr.swift -o ocr
// 用法：
//   ./ocr <单页PDF目录> <输出.json> [并发数]
//
// 输出：
//   { "pages": [ { "file": "page-0001.pdf", "seq": 1,
//                  "text": "整页文字（按行拼接）",
//                  "chars": 123,
//                  "blocks": [ { "y": 812.3, "x": 60.0, "size": 11.0, "text": "..." } ] } ] }
//   坐标单位是 PDF 点，与 pypdf visitor 的坐标一致（y 向上为正）。

import Foundation
import Vision
import PDFKit
import CoreGraphics

struct Block: Codable {
    let y: Double
    let x: Double
    let size: Double
    let text: String
}

struct PageText: Codable {
    let file: String
    let seq: Int
    let text: String
    let chars: Int
    let blocks: [Block]
}

struct Output: Codable {
    let pages: [PageText]
}

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write(("错误: " + msg + "\n").data(using: .utf8)!)
    exit(1)
}

/// 单页 OCR → (整页文本, 带坐标的文本块)
func recognize(page: PDFPage) -> (String, [Block]) {
    let bounds = page.bounds(for: .mediaBox)
    let scale: CGFloat = 2.0   // 提高识别率
    let pw = Double(bounds.width)
    let ph = Double(bounds.height)
    let width = Int(pw * scale)
    let height = Int(ph * scale)
    guard width > 0, height > 0 else { return ("", []) }

    guard let ctx = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else { return ("", []) }

    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.scaleBy(x: scale, y: scale)
    ctx.translateBy(x: -bounds.origin.x, y: -bounds.origin.y)
    page.draw(with: .mediaBox, to: ctx)

    guard let cgImage = ctx.makeImage() else { return ("", []) }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return ("", [])
    }

    guard let observations = request.results else { return ("", []) }

    // Vision 的 boundingBox 是归一化坐标（左下原点），转成 PDF 点坐标
    var blocks: [Block] = []
    for obs in observations {
        guard let cand = obs.topCandidates(1).first else { continue }
        let bb = obs.boundingBox
        // 文字高度 → 估算字号
        let boxH = bb.height * ph
        let size = max(6.0, min(40.0, boxH * 0.82))
        // 基线：Vision 给的是框，基线约在框底
        let y = (1.0 - bb.minY) * ph
        let x = bb.minX * pw
        blocks.append(Block(y: (y * 100).rounded() / 100,
                            x: (x * 100).rounded() / 100,
                            size: (size * 100).rounded() / 100,
                            text: cand.string))
    }

    // 排序：先上后下，同一行先左后右
    blocks.sort { a, b in
        if abs(a.y - b.y) > 3 { return a.y > b.y }
        return a.x < b.x
    }

    // 合并同一行的块 —— 教材排版是「第一章 企业法律制度   12」，
    // Vision 会把它拆成多个块，不合并的话章节正则匹配不到。
    var lines: [(y: Double, x: Double, size: Double, text: String)] = []
    for b in blocks {
        if var last = lines.last, abs(last.y - b.y) < 5 {
            last.text += " " + b.text
            last.size = max(last.size, b.size)
            lines[lines.count - 1] = last
        } else {
            lines.append((b.y, b.x, b.size, b.text))
        }
    }

    let text = lines.map { $0.text }.joined(separator: "\n")
    return (text, blocks)
}

let args = CommandLine.arguments
if args.count < 3 {
    fail("用法: ocr <单页PDF目录> <输出.json> [并发数]")
}

let dir = args[1]
let outPath = args[2]
let concurrency = args.count > 3 ? (Int(args[3]) ?? 4) : 4

let fm = FileManager.default
guard let files = try? fm.contentsOfDirectory(atPath: dir)
    .filter({ $0.hasSuffix(".pdf") })
    .sorted()
else {
    fail("读不到目录 \(dir)")
}

var results = [PageText?](repeating: nil, count: files.count)
let lock = NSLock()
let done = Counter()
final class Counter { var n = 0 }

let queue = DispatchQueue(label: "ocr", attributes: .concurrent)
let group = DispatchGroup()

for (idx, name) in files.enumerated() {
    group.enter()
    queue.async {
        defer { group.leave() }
        let path = "\(dir)/\(name)"
        var text = ""
        var blocks: [Block] = []
        if let doc = PDFDocument(url: URL(fileURLWithPath: path)),
           let page = doc.page(at: 0) {
            (text, blocks) = recognize(page: page)
        }
        lock.lock()
        results[idx] = PageText(file: name, seq: idx + 1, text: text,
                                 chars: text.count, blocks: blocks)
        done.n += 1
        if done.n % 25 == 0 { print("  已处理 \(done.n)/\(files.count)") }
        lock.unlock()
    }
    if idx % concurrency == concurrency - 1 { group.wait() }
}

group.wait()

let pages = results.compactMap { $0 }
let total = pages.reduce(0) { $0 + $1.chars }
let data = try JSONEncoder().encode(Output(pages: pages))
try data.write(to: URL(fileURLWithPath: outPath))

print("完成：\(pages.count) 页，共 \(total) 字符 → \(outPath)")
