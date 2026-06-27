// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "SkillManager",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "SkillManagerCore",
            targets: ["SkillManagerCore"]
        ),
        .executable(
            name: "SkillManagerApp",
            targets: ["SkillManagerApp"]
        ),
        .executable(
            name: "SkillManagerScan",
            targets: ["SkillManagerScan"]
        )
    ],
    targets: [
        .target(
            name: "SkillManagerCore"
        ),
        .executableTarget(
            name: "SkillManagerApp",
            dependencies: ["SkillManagerCore"],
            exclude: ["Info.plist"]
        ),
        .executableTarget(
            name: "SkillManagerScan",
            dependencies: ["SkillManagerCore"]
        ),
        .testTarget(
            name: "SkillManagerCoreTests",
            dependencies: ["SkillManagerCore"]
        )
    ]
)
