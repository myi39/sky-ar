"""Convert one GLB card model to USDZ for iOS AR Quick Look.

Usage:
  blender -b --factory-startup --python-exit-code 1 \
      --python tools/glb2usdz.py -- <src.glb> <dst.usdz> [target_size_m]

Every card in this project is one mesh carrying five materials, stacked
along the thinnest bounding-box axis. Front to back they are:
    star > body > background > side > back
The two frontmost planes are almost entirely transparent, so their
specular lobe shows up as a white haze over the whole card in AR Quick
Look. They get flattened; the three solid layers keep their sheen.

All console output is ASCII so it survives the CP932 console on
Japanese Windows.
"""
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Vector

EXPECTED_MESHES = 1
EXPECTED_MATERIALS = 5
MATTE_LAYER_COUNT = 2


def parse_args():
    argv = sys.argv
    if "--" not in argv:
        raise SystemExit("expected arguments after --")
    argv = argv[argv.index("--") + 1:]
    if len(argv) < 2:
        raise SystemExit("usage: <src.glb> <dst.usdz> [target_size_m]")
    target = float(argv[2]) if len(argv) > 2 else 0.15
    return argv[0], argv[1], target


def sniff_ext(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    return ".png"


def externalize_textures(texdir):
    """Write packed textures to disk under ASCII names.

    In background mode glTF textures stay lazy - has_data is False and
    img.save() writes nothing - and their original names are Japanese.
    Either problem alone makes the USDZ packager drop the texture, which
    renders the model white in AR Quick Look. Pull the packed bytes out
    directly instead.
    """
    os.makedirs(texdir, exist_ok=True)
    for idx, img in enumerate(bpy.data.images):
        packed = img.packed_file
        if packed is None:
            continue
        data = packed.data
        path = os.path.join(texdir, "tex_%02d%s" % (idx, sniff_ext(data)))
        with open(path, "wb") as handle:
            handle.write(data)
        img.unpack(method="REMOVE")
        img.filepath = path
        img.source = "FILE"
        img.reload()


def world_bbox(objects):
    lo = Vector((1e18, 1e18, 1e18))
    hi = Vector((-1e18, -1e18, -1e18))
    for ob in objects:
        for corner in ob.bound_box:
            world = ob.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], world[i])
                hi[i] = max(hi[i], world[i])
    return lo, hi


def check_structure(meshes):
    if len(meshes) != EXPECTED_MESHES:
        raise SystemExit("STRUCTURE: expected %d mesh, found %d"
                         % (EXPECTED_MESHES, len(meshes)))
    slots = [s for s in meshes[0].material_slots if s.material is not None]
    if len(slots) != EXPECTED_MATERIALS:
        raise SystemExit("STRUCTURE: expected %d materials, found %d"
                         % (EXPECTED_MATERIALS, len(slots)))
    return slots


def layers_front_to_back(ob, slots, axis):
    """Order material slots along the stacking axis, front first."""
    ordered = []
    for slot_i, slot in enumerate(slots):
        polys = [p for p in ob.data.polygons if p.material_index == slot_i]
        if not polys:
            raise SystemExit("STRUCTURE: material %s has no faces" % slot.material.name)
        centers = [(ob.matrix_world @ p.center)[axis] for p in polys]
        ordered.append((sum(centers) / len(centers), slot.material))
    ordered.sort(key=lambda item: item[0])
    return [mat for _, mat in ordered]


def set_input(bsdf, name, value):
    sock = bsdf.inputs.get(name)
    if sock is None or sock.is_linked:
        return
    sock.default_value = value


def principled(mat):
    if not mat.node_tree:
        return None
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            return node
    return None


def tune_materials(front_to_back):
    """Drop emission everywhere; flatten the transparent front planes.

    UsdPreviewSurface attenuates only the diffuse lobe by opacity - the
    emissive and specular components stay at full weight - so a plane
    whose alpha is zero is still visible. Note that the `specular` input
    Blender writes is not part of UsdPreviewSurface and is ignored; the
    dielectric specular is derived from `ior`.
    """
    print("--- materials (front to back) ---")
    for index, mat in enumerate(front_to_back):
        bsdf = principled(mat)
        if bsdf is None:
            raise SystemExit("STRUCTURE: %s has no principled bsdf" % mat.name)
        set_input(bsdf, "Emission Strength", 0.0)
        set_input(bsdf, "Emission Color", (0.0, 0.0, 0.0, 1.0))
        set_input(bsdf, "Metallic", 0.0)
        matte = index < MATTE_LAYER_COUNT
        if matte:
            set_input(bsdf, "IOR", 1.0)
            set_input(bsdf, "Roughness", 1.0)
        print("  %d %-12s %s" % (index, mat.name[:12], "MATTE" if matte else "glossy"))


# Spec-mandated: absence means this Blender build cannot produce a
# conformant USDZ, so a missing name is a hard error, not a skip.
REQUIRED_EXPORT_SETTINGS = {
    "generate_preview_surface": True,
    "export_textures_mode": "NEW",
    "usdz_downscale_size": "KEEP",
    # AR Quick Look expects Y-up in meters; Blender authors Z-up.
    "convert_orientation": True,
    "export_global_up_selection": "Y",
    "export_global_forward_selection": "NEGATIVE_Z",
    "convert_scene_units": "METERS",
}

# Defaults-hardening only; fine to skip if this Blender build lacks them.
BEST_EFFORT_EXPORT_SETTINGS = {
    "selected_objects_only": False,
    "export_animation": False,
    "export_materials": True,
    "relative_paths": False,
    "convert_world_material": False,
}


def export_kwargs(dst):
    names = set(bpy.ops.wm.usd_export.get_rna_type().properties.keys())
    missing = sorted(key for key in REQUIRED_EXPORT_SETTINGS if key not in names)
    if missing:
        raise SystemExit("EXPORT: required settings missing from this Blender build: %s"
                         % ", ".join(missing))
    kwargs = {"filepath": dst}
    kwargs.update(REQUIRED_EXPORT_SETTINGS)
    for key, value in BEST_EFFORT_EXPORT_SETTINGS.items():
        if key in names:
            kwargs[key] = value
    applied = ", ".join("%s=%r" % (key, kwargs[key]) for key in sorted(kwargs) if key != "filepath")
    print("export settings: %s" % applied)
    return kwargs


def main():
    src, dst, target = parse_args()
    print("SRC %s" % src)
    print("DST %s" % dst)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    slots = check_structure(meshes)
    ob = meshes[0]

    lo, hi = world_bbox(meshes)
    dims = hi - lo
    axis = int(np.argmin([dims.x, dims.y, dims.z]))

    longest = max(dims.x, dims.y, dims.z)
    scale = (target / longest) if longest > 0 else 1.0
    for obj in bpy.context.scene.objects:
        if obj.parent is None:
            obj.scale = obj.scale * scale
            obj.location = obj.location * scale
    bpy.context.view_layer.update()

    lo, hi = world_bbox(meshes)
    dims = hi - lo
    print("size %.4f x %.4f x %.4f m (stacking axis %s)"
          % (dims.x, dims.y, dims.z, "XYZ"[axis]))

    externalize_textures(os.path.join(tempfile.gettempdir(), "sky_ar_tex"))
    tune_materials(layers_front_to_back(ob, slots, axis))

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    result = bpy.ops.wm.usd_export(**export_kwargs(dst))
    print("export %s" % (result,))


main()
