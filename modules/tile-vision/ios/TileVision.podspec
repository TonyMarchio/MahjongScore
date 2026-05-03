require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'TileVision'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.homepage       = 'https://github.com/anthonymarchio/MahjongScore'
  s.author         = 'Anthony Marchio'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.4'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.frameworks = 'Vision'
end
