/**
 * Global switches and multipliers over every body's weather. `enabled` is the
 * menu's Weather setting (see ui/GraphicsSettings.ts): off hides the clouds,
 * rain and lightning, and the gas giants' passing storms and lightning
 * (world/gasLook.ts), and they cost nothing. Its own module so the gas
 * giants' look can read it without importing the cloud layers.
 */
export const weatherParams = {
  enabled: true,
  /** Scales every body's cloud cover. */
  coverage: 1,
  /** Brightness of the clouds. */
  brightness: 1,
  /** Brightness of lightning on the clouds. */
  lightning: 1,
  /** Scales the winds. */
  wind: 1,
};
