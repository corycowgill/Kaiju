"""Prepare closed crowd surfaces before the Blender skin/texture bake.

Requires numpy, scipy, trimesh, scikit-image, fast-simplification.
python tools/prepare_crowd_surfaces.py
Temporary arrays stay outside the game's shipped assets.
"""
from pathlib import Path
import numpy as np
import trimesh
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'crowd_build'
OUT.mkdir(exist_ok=True)
FILES = ['pedestrian1.glb','pedestrian2.glb','pedestrian3.glb','pedestrain4.glb',
         'pedestrain5.glb','pedestrian6.glb','pedestrain7.glb',
         'sample_2026-11-09T202125.720.glb','sample_2026-11-09T202401.941.glb']
for number, filename in enumerate(FILES,1):
    source = Path.home()/'Downloads'/filename
    mesh = trimesh.load(source,force='mesh')
    lo,hi = mesh.bounds
    mesh.vertices[:,0] = (mesh.vertices[:,0]-(lo[0]+hi[0])/2)*1.701788/(hi[0]-lo[0])
    mesh.vertices[:,1] = (mesh.vertices[:,1]-lo[1])*1.7/(hi[1]-lo[1])
    mesh.vertices[:,2] = (mesh.vertices[:,2]-(lo[2]+hi[2])/2)*1.7/(hi[1]-lo[1])
    pitch = .006
    voxels = mesh.voxelized(pitch)
    occupied = np.pad(voxels.matrix,3)
    occupied = ndimage.binary_closing(occupied,iterations=1)
    occupied = ndimage.binary_fill_holes(occupied)
    solid = trimesh.voxel.ops.matrix_to_marching_cubes(occupied,pitch=pitch)
    solid.apply_translation(voxels.transform[:3,3]-pitch*3)
    trimesh.smoothing.filter_taubin(solid,iterations=3)
    components = solid.split(only_watertight=False)
    solid = trimesh.util.concatenate([m for m in components if m.area > .0008])
    for lod,budget in [('near',3600),('far',900),('distant',300)]:
        reduced = solid.simplify_quadric_decimation(face_count=budget,aggression=7)
        reduced.remove_unreferenced_vertices()
        reduced.fix_normals()
        np.savez(OUT/f'person_{number:02d}_{lod}.npz',vertices=reduced.vertices,faces=reduced.faces)
        print(filename,lod,len(reduced.faces),flush=True)
