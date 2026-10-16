import { describe, expect, it } from 'vitest';

import {
  APP_DELEGATE_MARKER,
  SCENE_MANIFEST,
  adoptSceneLifecycleInAppDelegate,
  adoptSceneLifecycleInInfoPlist,
} from './with-ios-scene-lifecycle.ts';
import { expo57AppDelegate as template } from './__fixtures__/app-delegate-expo57.ts';

describe('adoptSceneLifecycleInAppDelegate', () => {
  it('starts from a template that creates the window from UIScreen', () => {
    expect(template).toContain('window = UIWindow(frame: UIScreen.main.bounds)');
    expect(template).toContain('class AppDelegate: ExpoAppDelegate {');
  });

  it('makes the AppDelegate a factory provider and leaves the window to the scene delegate', () => {
    const out = adoptSceneLifecycleInAppDelegate(template);

    expect(out).toContain('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    expect(out).toContain(APP_DELEGATE_MARKER);
    expect(out).not.toContain('UIScreen');
    expect(out).not.toContain('startReactNative');
    expect(out).not.toContain('#if os(iOS) || os(tvOS)');
    // The factory is still created at launch: the scene delegate reads it.
    expect(out).toContain('reactNativeFactory = factory');
    expect(out).toContain('var window: UIWindow?');
    expect(out).toContain(
      'return super.application(application, didFinishLaunchingWithOptions: launchOptions)',
    );
    // Deep links: the overrides the scene delegate forwards URLs to stay.
    expect(out).toContain('RCTLinkingManager.application(app, open: url, options: options)');
    expect(out).toContain('continue userActivity: NSUserActivity');
    // expo-dev-client resolves the bundle through ReactNativeDelegate.
    expect(out).toContain('bridge.bundleURL ?? bundleURL()');
  });

  it('is idempotent', () => {
    const once = adoptSceneLifecycleInAppDelegate(template);
    expect(adoptSceneLifecycleInAppDelegate(once)).toBe(once);
  });

  it('fails clearly when the class declaration changed', () => {
    const changed = template.replace(
      'class AppDelegate: ExpoAppDelegate {',
      'class AppDelegate: ExpoAppDelegate, SomethingElse {',
    );
    expect(() => adoptSceneLifecycleInAppDelegate(changed)).toThrow(
      /no longer has the expected shape/,
    );
  });

  it('fails clearly when the window block is gone (Expo adopted scenes)', () => {
    const changed = template.replace('window = UIWindow(frame: UIScreen.main.bounds)', '');
    expect(() => adoptSceneLifecycleInAppDelegate(changed)).toThrow(/remove this plugin/);
  });

  it('fails clearly when the template already conforms to the provider protocol', () => {
    const changed = template.replace(
      'class AppDelegate: ExpoAppDelegate {',
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
    );
    expect(() => adoptSceneLifecycleInAppDelegate(changed)).toThrow(
      /already conforms to ExpoReactNativeFactoryProvider/,
    );
  });

  it('fails clearly when a member the protocol needs is missing', () => {
    const changed = template.replace('  var reactNativeFactory: RCTReactNativeFactory?\n', '');
    expect(() => adoptSceneLifecycleInAppDelegate(changed)).toThrow(/missing member/);
  });
});

describe('adoptSceneLifecycleInInfoPlist', () => {
  const plist = { CFBundleURLTypes: [{ CFBundleURLSchemes: ['transport'] }] };

  it('declares a single-window scene manifest with the Expo scene delegate', () => {
    const out = adoptSceneLifecycleInInfoPlist(plist);
    expect(out.UIApplicationSceneManifest).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    });
    // Other keys, such as the deep link scheme, are kept.
    expect(out.CFBundleURLTypes).toEqual(plist.CFBundleURLTypes);
  });

  it('is idempotent and does not share the manifest object', () => {
    const once = adoptSceneLifecycleInInfoPlist(plist);
    expect(adoptSceneLifecycleInInfoPlist(once)).toEqual(once);
    expect(once.UIApplicationSceneManifest).not.toBe(SCENE_MANIFEST);
  });

  it('accepts the same manifest read back from disk with its keys sorted', () => {
    const fromDisk = {
      ...plist,
      UIApplicationSceneManifest: {
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [
            {
              UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
              UISceneConfigurationName: 'Default',
            },
          ],
        },
        UIApplicationSupportsMultipleScenes: false,
      },
    };
    expect(adoptSceneLifecycleInInfoPlist(fromDisk).UIApplicationSceneManifest).toEqual(
      SCENE_MANIFEST,
    );
  });

  it('fails clearly on a different scene manifest', () => {
    const other = {
      ...plist,
      UIApplicationSceneManifest: { UIApplicationSupportsMultipleScenes: true },
    };
    expect(() => adoptSceneLifecycleInInfoPlist(other)).toThrow(
      /different UIApplicationSceneManifest/,
    );
  });
});
