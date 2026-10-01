import * as THREE from 'three';
import { tileableCloudNoise } from '../gen/cloudNoise';

let noiseTexture: THREE.Data3DTexture | null = null;

/**
 * The tileable, equalised 3D noise (gen/cloudNoise.ts: R shapes, G finer
 * detail, both uniform on [0, 1]) as a repeating 3D texture. Made once and
 * shared by every cloud layer and nebula (never disposed).
 */
export function cloudNoiseTexture(): THREE.Data3DTexture {
  if (noiseTexture) return noiseTexture;
  const size = 64;
  const texture = new THREE.Data3DTexture(tileableCloudNoise(size, 20260930), size, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return (noiseTexture = texture);
}
