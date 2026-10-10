import bpy,bmesh,json,sys,argparse
from pathlib import Path
from mathutils import Vector
parser=argparse.ArgumentParser(description='Create an editable Sato authoring file with packed textures and source actions.')
parser.add_argument('input',type=Path)
parser.add_argument('output',type=Path)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()),merge_vertices=True)
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
assert len(rig.data.bones)==53
assert len(bpy.data.actions)==46
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  # Keep the GLB's split normals through welding and quad reconstruction.
  # BMesh otherwise smooths the deliberate planes of the new silhouette.
  normals=[tuple(n.vector) for n in o.data.corner_normals]
  stored=o.data.attributes.new('_sato_source_normal','FLOAT_VECTOR','CORNER')
  stored.data.foreach_set('vector',[c for n in normals for c in n])
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
  layer=bm.loops.layers.float_vector['_sato_source_normal']
  for e in bm.edges:
   if len(e.link_faces)==2:
    a,b=e.link_faces
    for v in e.verts:
     na=next(l[layer] for l in a.loops if l.vert==v);nb=next(l[layer] for l in b.loops if l.vert==v)
     if (na-nb).length>1e-4:e.smooth=False;break
  bmesh.ops.join_triangles(bm,faces=list(bm.faces),angle_face_threshold=.35,angle_shape_threshold=.8,cmp_seam=True,cmp_sharp=True,cmp_uvs=True,cmp_materials=True)
  bm.to_mesh(o.data);bm.free();o.data.update()
  stored=o.data.attributes['_sato_source_normal']
  o.data.normals_split_custom_set([tuple(v.vector) for v in stored.data]);o.data.attributes.remove(stored)
  o['Design']='Sato low poly · connected geometry around original bind pose'
for side in ['L','R']:
 obj=bpy.data.objects.get('Sato_arm_hand_'+side)
 assert obj and all(obj.vertex_groups.get('DEF-f_'+f+'.03.'+side) for f in ['index','middle','ring','pinky'])
 assert obj.vertex_groups.get('DEF-thumb.03.'+side)
rig['Preservation']='53 bones · 46 clips · rest transforms and inverse binds unchanged in GLB'
rig.animation_data.action=None
for t in rig.animation_data.nla_tracks:t.mute=True
idle=next(a for a in bpy.data.actions if a.name.endswith('Idle_Loop') and all(s not in a.name for s in ['Crouch','Pistol','Sitting','Swim','Torch','Spell']))
rig.animation_data.action=idle
if idle.slots:rig.animation_data.action_slot=idle.slots[0]
scene=bpy.context.scene;scene.frame_set(0)
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.world=bpy.data.worlds.new('Sato studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.30,.34,.40,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
studio=bpy.data.collections.new('Studio · preview only');scene.collection.children.link(studio)
def place(o):
 for c in list(o.users_collection):c.objects.unlink(o)
 studio.objects.link(o)
def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
for location,power,size in [((-1.5,-2.2,3),100,3),((2,-.8,2),70,2),((.5,2,2),100,2)]:
 bpy.ops.object.light_add(type='AREA',location=location);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,.5));place(o)
bpy.ops.object.camera_add(location=(1.3,-2.6,1.15));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=1.18;aim(camera,(0,0,.48));place(camera);scene.camera=camera
scene.render.resolution_x=900;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
for a in bpy.data.actions:a.use_fake_user=True
bpy.ops.file.pack_all();bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_distance=1.65;area.spaces.active.region_3d.view_location=Vector((0,0,.48));area.spaces.active.shading.type='MATERIAL'
args.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()))
print('SATO_BLEND',json.dumps({'bones':len(rig.data.bones),'clips':len(bpy.data.actions),'meshes':len([o for o in scene.objects if o.type=='MESH' and o.name.startswith('Sato_')])}))
