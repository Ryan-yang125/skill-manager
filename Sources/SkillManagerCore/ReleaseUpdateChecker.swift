import Foundation

public struct ReleaseCheckResult: Codable, Equatable, Sendable {
    public var currentVersion: String
    public var latestVersion: String
    public var tagName: String
    public var releaseName: String
    public var releaseURL: URL
    public var isUpdateAvailable: Bool

    public init(
        currentVersion: String,
        latestVersion: String,
        tagName: String,
        releaseName: String,
        releaseURL: URL,
        isUpdateAvailable: Bool
    ) {
        self.currentVersion = currentVersion
        self.latestVersion = latestVersion
        self.tagName = tagName
        self.releaseName = releaseName
        self.releaseURL = releaseURL
        self.isUpdateAvailable = isUpdateAvailable
    }
}

public final class ReleaseUpdateChecker: @unchecked Sendable {
    private let latestReleaseURL: URL
    private let session: URLSession

    public init(
        latestReleaseURL: URL = URL(string: "https://api.github.com/repos/Ryan-yang125/skill-manager/releases/latest")!,
        session: URLSession = .shared
    ) {
        self.latestReleaseURL = latestReleaseURL
        self.session = session
    }

    public func check(currentVersion: String) async throws -> ReleaseCheckResult {
        var request = URLRequest(url: latestReleaseURL)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("SkillManager/\(currentVersion)", forHTTPHeaderField: "User-Agent")

        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw ReleaseUpdateError.badStatus(http.statusCode)
        }

        return try decode(data: data, currentVersion: currentVersion)
    }

    public func decode(data: Data, currentVersion: String) throws -> ReleaseCheckResult {
        let release = try JSONDecoder.releaseDecoder.decode(GitHubRelease.self, from: data)
        guard let releaseURL = URL(string: release.htmlURL) else {
            throw ReleaseUpdateError.invalidReleaseURL
        }

        let latestVersion = ReleaseVersion.normalized(release.tagName)
        let isAvailable = ReleaseVersion(release.tagName) > ReleaseVersion(currentVersion)
        return ReleaseCheckResult(
            currentVersion: currentVersion,
            latestVersion: latestVersion,
            tagName: release.tagName,
            releaseName: release.name ?? release.tagName,
            releaseURL: releaseURL,
            isUpdateAvailable: isAvailable
        )
    }
}

public enum ReleaseUpdateError: LocalizedError, Equatable {
    case badStatus(Int)
    case invalidReleaseURL

    public var errorDescription: String? {
        switch self {
        case .badStatus(let statusCode):
            return "GitHub Release 请求失败：HTTP \(statusCode)"
        case .invalidReleaseURL:
            return "GitHub Release 地址无效"
        }
    }
}

struct ReleaseVersion: Comparable, Equatable {
    private var parts: [Int]

    init(_ rawValue: String) {
        self.parts = ReleaseVersion.normalized(rawValue)
            .split(separator: ".")
            .map { Int($0) ?? 0 }
        while parts.count < 3 {
            parts.append(0)
        }
    }

    static func normalized(_ rawValue: String) -> String {
        rawValue
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingPrefix("v")
    }

    static func < (lhs: ReleaseVersion, rhs: ReleaseVersion) -> Bool {
        for index in 0..<max(lhs.parts.count, rhs.parts.count) {
            let left = index < lhs.parts.count ? lhs.parts[index] : 0
            let right = index < rhs.parts.count ? rhs.parts[index] : 0
            if left != right {
                return left < right
            }
        }
        return false
    }
}

private struct GitHubRelease: Decodable {
    var tagName: String
    var name: String?
    var htmlURL: String

    enum CodingKeys: String, CodingKey {
        case tagName = "tag_name"
        case name
        case htmlURL = "html_url"
    }
}

private extension JSONDecoder {
    static var releaseDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

private extension String {
    func trimmingPrefix(_ prefix: String) -> String {
        hasPrefix(prefix) ? String(dropFirst(prefix.count)) : self
    }
}
