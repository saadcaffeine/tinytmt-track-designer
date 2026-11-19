/*
 * Entry point for vendor/three-view3d.min.js — the slice of three.js used by the
 * "View in 3D" add-on, bundled as one classic script that sets window.TinyTMTThree.
 * Rebuild with:  tools/three-bundle/build.sh
 */
export {
  Scene, PerspectiveCamera, OrthographicCamera, WebGLRenderer, Color, Fog, Group, Mesh, InstancedMesh,
  BoxGeometry, CylinderGeometry, SphereGeometry, ExtrudeGeometry, PlaneGeometry, BufferGeometry, Float32BufferAttribute,
  Shape, MeshStandardMaterial, MeshBasicMaterial, LineBasicMaterial, LineSegments, EdgesGeometry, GridHelper,
  HemisphereLight, DirectionalLight, AmbientLight, Vector3, Vector2, Matrix4, Quaternion, Box3, Object3D,
  CatmullRomCurve3, SRGBColorSpace, PCFShadowMap, DoubleSide, MathUtils, Sprite, SpriteMaterial, CanvasTexture,
  REVISION
} from 'three';
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
export { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
export { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
export { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
