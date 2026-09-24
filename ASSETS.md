# Optional 3D assets

The source repository and clean release archive do not contain a third-party 3D mannequin. `npm install` installs code dependencies only; it does not download a model. Auteur still works without one, using its procedural mannequin and vector silhouette.

To use a model you have the rights to use, place a glTF/GLB file at `apps/desktop/public/models/mannequin.glb` and, for the web client, `apps/web/public/models/mannequin.glb`. Both directories are ignored by Git. The pose importer recognizes common Mixamo and Unreal bone names. It expects hips, spine, neck, head, arms, hands, legs, and feet; the bind pose may be a T-pose or A-pose.

The reference model used during development was Mixamo “X Bot” from the [three.js example assets](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf). It is not redistributed here. Check the model's rights before using or sharing it.

Auteur's scene props in `packages/core/src/three/props.ts` are procedural and need no external model files.
