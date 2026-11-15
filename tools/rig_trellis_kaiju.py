"""Skin a front-view T-pose TRELLIS.2 mesh and export the gameplay GLB.

blender -b --factory-startup --python tools/rig_trellis_kaiju.py -- \
    cindervault ../kaiju-trellis/raw/cindervault.glb assets/kaiju_model/cindervault.glb

The rig uses the game's existing joint names, +Z forward and Y up in glTF.
Use --forward for a mesh whose toes or other details confuse orientation
detection. Use --landmarks for per-mesh joint refinements in normalized Blender
coordinates (X model-left, Y back, Z up), keyed by existing bone names.
"""

import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from trellis_kaiju_motion import PROFILES, STYLES, author_clips


HEIGHT = 1.92
SIDES = (("Left", 1), ("Right", -1))


def coordinates(meshes):
    points = []
    for mesh in meshes:
        vertices = np.empty(len(mesh.data.vertices) * 3, dtype=np.float32)
        mesh.data.vertices.foreach_get("co", vertices)
        points.append(vertices.reshape(-1, 3))
    return np.concatenate(points)


def slab(points, low, high):
    part = points[(points[:, 2] >= low) & (points[:, 2] <= high)]
    return part if len(part) >= 8 else points


def orient(meshes, direction):
    points = coordinates(meshes)
    low, high = np.quantile(points[:, 2], [0.002, 0.998])
    height = high - low
    if height <= 1e-5:
        raise ValueError("Input has no usable vertical extent")
    if direction == "auto":
        upper = slab(points, low + 0.52 * height, low + 0.82 * height)
        spread = np.diff(np.quantile(upper[:, :2], [0.025, 0.975], axis=0), axis=0)[0]
        depth = 1 - int(np.argmax(spread))
        ankle = slab(points, low + 0.08 * height, low + 0.17 * height)
        toes = slab(points, low, low + 0.062 * height)
        centre = np.median(ankle[:, depth])
        extremes = np.quantile(toes[:, depth], [0.075, 0.925]) - centre
        asymmetry = sum(extremes)
        sign = int(np.sign(asymmetry)) if abs(asymmetry) > height * 0.018 else (1 if depth == 0 else -1)
        direction = "xy"[depth] + ("+" if sign > 0 else "-")
        print(f"Detected Blender facing {direction} from T-pose span and toes")
    angles = {"y-": 0, "x+": -math.pi / 2, "x-": math.pi / 2, "y+": math.pi}
    rotation = Matrix.Rotation(angles[direction], 4, 'Z')
    points = points @ np.asarray(rotation.to_3x3()).T
    waist = slab(points, low + 0.42 * height, low + 0.54 * height)
    left, right = np.quantile(waist[:, 0], [0.025, 0.975])
    midline = 0.5 * (left + right)
    core = waist[abs(waist[:, 0] - midline) <= (right - left) * 0.35]
    centre_y = np.median(core[:, 1]) if len(core) else np.median(waist[:, 1])
    floor = float(np.min(points[:, 2]))
    # Even when a narrow horn is taller than the 99.8th percentile, preserve it.
    transform = Matrix.Scale(HEIGHT / (high - floor), 4) @ Matrix.Translation((-midline, -centre_y, -floor)) @ rotation
    for mesh in meshes:
        mesh.data.transform(transform)
        mesh.data.update()
    return coordinates(meshes)


def sample_part(points, side, fraction, minimum):
    outward = points[:, 0] * side
    useful = points[(outward >= fraction[0]) & (outward <= fraction[1])]
    return np.median(useful, axis=0) if len(useful) >= 8 else np.array(minimum)


def skeleton_points(points, profile, overrides):
    hip_h = HEIGHT * profile.hip
    arm_h = HEIGHT * profile.shoulders
    head_h = HEIGHT * profile.head
    torso = slab(points, hip_h - 0.09, hip_h + 0.12)
    hip_w = float(np.quantile(abs(torso[:, 0]), 0.67)) * 0.55
    torso = slab(points, arm_h - 0.28, arm_h - 0.18)
    shoulder_w = float(np.quantile(abs(torso[:, 0]), 0.83)) * profile.shoulder_width
    arm = slab(points, arm_h - 0.15, arm_h + 0.16)
    head = slab(points[abs(points[:, 0]) < shoulder_w * 0.9], head_h - 0.07, head_h + 0.07)
    head_y = float(np.median(head[:, 1]))
    joints = {
        "Hips": (0, 0, hip_h),
        "Spine02": (0, -0.015, hip_h + (arm_h - hip_h) * 0.26),
        "Spine01": (0, -0.025, hip_h + (arm_h - hip_h) * 0.56),
        "Spine": (0, -0.04, arm_h - 0.06),
        "neck": (0, head_y * 0.5, (arm_h + head_h) * 0.5),
        "Head": (0, head_y, head_h),
    }
    for side, sign in SIDES:
        arm_tip = float(np.quantile(arm[:, 0] * sign, 0.995))
        span = arm_tip - shoulder_w
        if span < HEIGHT * 0.16:
            raise ValueError(f"Digitized {side.lower()} T-pose arm is too short. Check facing and shoulder height.")
        joints[side + "Shoulder"] = (sign * (shoulder_w * 0.38), -0.025, arm_h - 0.035)
        for name, fraction in (("Arm", 0.03), ("ForeArm", profile.elbow), ("Hand", profile.wrist)):
            x = shoulder_w + span * fraction
            sample = sample_part(arm, sign, (x - span * 0.08, x + span * 0.08), (x * sign, 0, arm_h))
            joints[side + name] = (x * sign, float(sample[1]), float(sample[2]))

        for name, fraction in (("UpLeg", profile.hip - 0.025), ("Leg", profile.knee), ("Foot", profile.ankle)):
            z = HEIGHT * fraction
            leg = slab(points, z - 0.065, z + 0.065)
            leg = leg[(leg[:, 0] * sign > hip_w * 0.28) & (leg[:, 0] * sign < shoulder_w * 1.48)]
            median = np.median(leg, axis=0) if len(leg) > 7 else (sign * hip_w, 0, z)
            joints[side + name] = (float(median[0]), float(median[1]), z)
        ankle = Vector(joints[side + "Foot"])
        foot = slab(points, 0.015, ankle.z)
        front = sample_part(foot, sign, (abs(ankle.x) - 0.16, abs(ankle.x) + 0.16), ankle)
        tip = max(0.075, ankle.y - float(front[1]) + 0.08)
        joints[side + "ToeBase"] = (ankle.x + sign * 0.025, ankle.y - tip, ankle.z * 0.46)

    if profile.tail:
        rump = slab(points[(points[:, 1] > 0.22) & (abs(points[:, 0]) < 0.27)], 0.08, hip_h + 0.08)
        if len(rump) > 16 and np.max(rump[:, 1]) > 0.42:
            tip = np.quantile(rump[:, 1], 0.98)
            joints["Tail"] = (0, 0.22, hip_h - 0.04)
            for name, fraction in (("Tail02", 0.42), ("Tail03", 0.81)):
                y = 0.22 + (tip - 0.22) * fraction
                sample = rump[abs(rump[:, 1] - y) < 0.12]
                if not len(sample):
                    sample = rump
                joints[name] = (float(np.median(sample[:, 0])), y, float(np.median(sample[:, 2])))
    for name, position in overrides.items():
        if name not in joints or len(position) != 3 or not np.all(np.isfinite(position)):
            raise ValueError(f"Invalid landmark {name}: {position}")
        joints[name] = position
    return {name: Vector(position) for name, position in joints.items()}


def make_rig(joints):
    armature = bpy.data.armatures.new("Kaiju skeleton")
    rig = bpy.data.objects.new("Armature", armature)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    parents = {"Hips": None, "Spine02": "Hips", "Spine01": "Spine02", "Spine": "Spine01", "neck": "Spine", "Head": "neck"}
    tips = {"Hips": None, "Spine02": "Spine01", "Spine01": "Spine", "Spine": "neck", "neck": "Head", "Head": None}
    for side, _ in SIDES:
        for anchor, names in (("Spine", ("Shoulder", "Arm", "ForeArm", "Hand")), ("Hips", ("UpLeg", "Leg", "Foot", "ToeBase"))):
            chain = [side + name for name in names]
            parents.update(zip(chain, [anchor, *chain[:-1]]))
            tips.update(zip(chain, [*chain[1:], None]))
    if "Tail" in joints:
        parents.update({"Tail": "Hips", "Tail02": "Tail", "Tail03": "Tail02"})
        tips.update({"Tail": "Tail02", "Tail02": "Tail03", "Tail03": None})
    bpy.ops.object.mode_set(mode='EDIT')
    for name, parent in parents.items():
        bone = armature.edit_bones.new(name)
        bone.head = joints[name]
        tip = joints.get(tips[name])
        if tip is not None:
            bone.tail = tip
        elif name == "Hips":
            bone.tail = joints[name] + Vector((0, 0.14, 0))
        elif parent == "neck":
            bone.tail = joints[name] + Vector((0, -0.025, 0.16))
        else:
            bone.tail = joints[name] + 0.52 * (joints[name] - joints[parent])
        if bone.length < 1e-4:
            raise ValueError(f"Coincident landmarks leave {name} with zero length")
        if parent:
            bone.parent = armature.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def bind_mesh(mesh, rig):
    """Blend nearby segments and suppress weights across the leg gap and midline."""
    points = coordinates([mesh])
    bones = list(rig.data.bones)
    weights = np.empty((len(points), len(bones)), dtype=np.float32)
    for index, bone in enumerate(bones):
        start, end = np.array(bone.head_local), np.array(bone.tail_local)
        if bone.name == "Hips":
            end = start + (0, 0, 0.085)
        axis = end - start
        along = np.clip(((points - start) @ axis) / (axis @ axis), 0, 1)
        distance = np.linalg.norm(points - start - along[:, None] * axis, axis=1)
        left = bone.name.startswith("Left")
        if left or bone.name.startswith("Right"):
            # Keep the opposite leg from dragging the inner calf or toes.
            distance += np.maximum(0, -(1 if left else -1) * points[:, 0] - 0.028) * 3
        if bone.name in ("Head", "neck"):
            distance += np.maximum(0, rig.data.bones["Spine"].head_local.z - points[:, 2])
        weights[:, index] = distance
    closest = np.argpartition(weights, 3, axis=1)[:, :4]
    best = np.take_along_axis(weights, closest, axis=1)
    # Narrow blend zones at joints while preserving rigid movement of distant details.
    best = np.exp(-(best - best.min(axis=1, keepdims=True)) / 0.042)
    best[best < 0.035] = 0
    best /= best.sum(axis=1, keepdims=True)
    mesh.vertex_groups.clear()
    groups = [mesh.vertex_groups.new(name=bone.name) for bone in bones]
    for vertex, (indexes, values) in enumerate(zip(closest.tolist(), best.tolist())):
        for index, weight in zip(indexes, values):
            if weight:
                groups[index].add([vertex], weight, 'REPLACE')
    modifier = mesh.modifiers.new("Kaiju deformation", 'ARMATURE')
    modifier.object = rig
    mesh.parent = rig


def load_meshes(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not meshes:
        raise ValueError("The source GLB contains no mesh")
    if any(obj.type == 'ARMATURE' for obj in bpy.context.scene.objects):
        raise ValueError("Expected an unrigged TRELLIS export")
    for mesh in meshes:
        mesh.data.transform(mesh.matrix_world)
        mesh.parent = None
        mesh.matrix_world = Matrix.Identity(4)
        mesh.select_set(False)
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = max(meshes, key=lambda mesh: len(mesh.data.vertices))
    if len(meshes) > 1:
        bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    mesh.select_set(False)
    return mesh


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kaiju', choices=PROFILES)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--forward', choices=('auto', 'x+', 'x-', 'y+', 'y-'), default='auto')
    parser.add_argument('--landmarks', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if args.source.resolve() == args.output.resolve():
        raise ValueError("Preserve the raw export by choosing another output path")
    mesh = load_meshes(args.source.resolve())
    mesh.name = args.kaiju.capitalize()
    points = orient([mesh], args.forward)
    profile = PROFILES[args.kaiju]
    overrides = json.loads(args.landmarks.read_text()) if args.landmarks else {}
    joints = skeleton_points(points, profile, overrides)
    rig = make_rig(joints)
    bind_mesh(mesh, rig)
    author_clips(rig, profile, STYLES[args.kaiju])
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.gltf(
        filepath=str(args.output.resolve()), export_format='GLB', export_animations=True,
        export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True, export_anim_slide_to_zero=True,
        export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression',
        export_image_format='AUTO', export_image_add_webp=False, export_materials='EXPORT',
    )
    if 'FINISHED' not in result:
        raise RuntimeError(f"Blender did not export {args.output}")
    print(f"Rigged {args.kaiju}: {len(mesh.data.polygons):,} faces, {len(joints)} joints, {args.output}")


if __name__ == '__main__':
    main()
