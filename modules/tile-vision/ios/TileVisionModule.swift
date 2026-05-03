import ExpoModulesCore
import Vision

public class TileVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TileVision")

    // Returns a base64-encoded NSKeyedArchiver blob of VNFeaturePrintObservation.
    // Store this blob alongside the tile set; it persists across app launches.
    AsyncFunction("generateFingerprint") { (imageUri: String) throws -> String in
      let obs = try Self.featurePrint(for: imageUri)
      let data = try NSKeyedArchiver.archivedData(withRootObject: obs, requiringSecureCoding: true)
      return data.base64EncodedString()
    }

    // Computes the distance between two fingerprint blobs (lower = more similar).
    // Uses Vision's built-in distance metric which is calibrated for this feature type.
    AsyncFunction("computeDistance") { (fp1: String, fp2: String) throws -> Double in
      guard let d1 = Data(base64Encoded: fp1), let d2 = Data(base64Encoded: fp2) else {
        throw NSError(domain: "TileVision", code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Invalid base64 fingerprint data"])
      }
      guard
        let obs1 = try NSKeyedUnarchiver.unarchivedObject(ofClass: VNFeaturePrintObservation.self, from: d1),
        let obs2 = try NSKeyedUnarchiver.unarchivedObject(ofClass: VNFeaturePrintObservation.self, from: d2)
      else {
        throw NSError(domain: "TileVision", code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Could not deserialize fingerprint"])
      }
      var distance: Float = 0
      try obs1.computeDistance(&distance, to: obs2)
      return Double(distance)
    }
  }

  private static func featurePrint(for uri: String) throws -> VNFeaturePrintObservation {
    let url = uri.hasPrefix("file://") ? URL(string: uri)! : URL(fileURLWithPath: uri)
    let request = VNGenerateImageFeaturePrintRequest()
    let handler = VNImageRequestHandler(url: url, options: [:])
    try handler.perform([request])
    guard let obs = request.results?.first as? VNFeaturePrintObservation else {
      throw NSError(domain: "TileVision", code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Feature print generation failed for: \(uri)"])
    }
    return obs
  }
}
