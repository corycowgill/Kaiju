"""Bake a TRELLIS kaiju's rest-pose surface position and normal per texel.

blender -b --factory-startup --python tools/trellis_kaiju_bake.py -- \
    cindervault ../devtools/trellis/raw/cindervault.glb ../devtools/trellis/bake/cindervault.npz

The mesh is placed exactly as tools/rig_trellis_kaiju.py places it (height
1.92, floor at 0, X model-left, Y back, Z up), so a texel's position lines up
with the front-view T-pose art. tools/trellis_kaiju_look.py reads the result
to paint the emissive map.
"""

import argparse
from pathlib import Path
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rig_trellis_kaiju import load_meshes, orient


def bake(mesh, size, socket):
    material = bpy.data.materials.new("bake " + socket)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    geometry = nodes.new('ShaderNodeNewGeometry')
    emission = nodes.new('ShaderNodeEmission')
    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(geometry.outputs[socket], emission.inputs['Color'])
    links.new(emission.outputs['Emission'], output.inputs['Surface'])
    image = bpy.data.images.new(socket, size, size, alpha=True, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    image.generated_color = (0, 0, 0, 0)
    target = nodes.new('ShaderNodeTexImage')
    target.image = image
    nodes.active = target
    mesh.data.materials.clear()
    mesh.data.materials.append(material)
    bpy.ops.object.bake(type='EMIT', margin=6, use_clear=True)
    pixels = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    # Blender images start at the bottom row; glTF UV v=0 is the top of the texture
    return pixels.reshape(size, size, 4)[::-1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kaiju')
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--forward', choices=('auto', 'x+', 'x-', 'y+', 'y-'), default='auto')
    parser.add_argument('--size', type=int, default=1024)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    mesh = load_meshes(args.source.resolve())
    orient([mesh], args.forward)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.cycles.device = 'CPU'
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    position = bake(mesh, args.size, 'Position')
    normal = bake(mesh, args.size, 'Normal')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.output, position=position[..., :3], normal=normal[..., :3], covered=position[..., 3] > 0.5)
    print(f"Baked {args.kaiju}: {int((position[..., 3] > 0.5).sum()):,} texels -> {args.output}")


if __name__ == '__main__':
    main()
