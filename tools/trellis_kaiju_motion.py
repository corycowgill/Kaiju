"""In-place biped locomotion and attack actions for the TRELLIS kaiju rigs."""

from dataclasses import dataclass
import math

import bpy
from mathutils import Quaternion, Vector


@dataclass(frozen=True)
class Profile:
    hip: float
    knee: float
    ankle: float
    shoulders: float
    shoulder_width: float
    head: float
    elbow: float
    wrist: float
    stride: float
    lean: float
    arm_drop: float
    opening: float
    beam_twist: float
    tail: bool = False


PROFILES = {
    'cindervault': Profile(.47, .25, .106, .77, 1.12, .855, .55, .79, .94, .18, 68, .92, .29),
    'brineveil': Profile(.51, .285, .103, .72, .97, .827, .52, .84, 1.05, .14, 60, 1.16, -.40),
    'rimehorn': Profile(.48, .27, .117, .73, 1.08, .810, .51, .81, .81, .23, 73, .77, .12),
    'vesperax': Profile(.54, .31, .122, .76, 1.05, .851, .55, .76, 1.19, .11, 55, 1.25, .51),
    'thornwake': Profile(.47, .26, .116, .72, 1.13, .833, .52, .81, .85, .09, 69, 1.25, -.17),
    'ferrumaw': Profile(.50, .28, .104, .75, 1.05, .860, .52, .81, .92, .19, 63, .87, -.47, True),
}

FPS = 30
AXIS_X = Vector((1, 0, 0))
AXIS_Y = Vector((0, 1, 0))
AXIS_Z = Vector((0, 0, 1))


class Puppet:
    def __init__(self, rig):
        self.rig = rig
        self.bones = rig.pose.bones
        self.rest = {bone.name: bone.bone.matrix_local.to_quaternion() for bone in self.bones}
        self.inverse = {name: q.inverted() for name, q in self.rest.items()}
        self.previous = {}
        for bone in self.bones:
            bone.rotation_mode = 'QUATERNION'

    def reset(self):
        for bone in self.bones:
            bone.rotation_quaternion = Quaternion()
        self.bones['Hips'].location = (0, 0, 0)

    def rotate(self, name, pitch=0, roll=0, yaw=0):
        delta = Quaternion(AXIS_Z, yaw) @ Quaternion(AXIS_X, pitch) @ Quaternion(AXIS_Y, roll)
        self.bones[name].rotation_quaternion = self.inverse[name] @ delta @ self.rest[name]

    def hips(self, up=0, fore=0, pitch=0, roll=0, yaw=0):
        self.bones['Hips'].location = self.inverse['Hips'] @ Vector((0, -fore, up))
        self.rotate('Hips', pitch, roll, yaw)

    def arm(self, side, drop, forward=0, elbow=0, wrist=0):
        prefix = 'Left' if side > 0 else 'Right'
        drop_axis = Quaternion(AXIS_Y, side * drop)
        reach = Quaternion(AXIS_X, -forward)
        name = prefix + 'Arm'
        self.bones[name].rotation_quaternion = self.inverse[name] @ reach @ drop_axis @ self.rest[name]
        name = prefix + 'ForeArm'
        # Its X-directed rest segment bends toward the palm's front when the upper arm is lowered.
        self.bones[name].rotation_quaternion = self.inverse[name] @ Quaternion(AXIS_Z, -side * elbow) @ self.rest[name]
        self.rotate(prefix + 'Hand', yaw=-side * wrist)

    def leg(self, side, thigh=0, knee=0, ankle=0):
        prefix = 'Left' if side > 0 else 'Right'
        self.rotate(prefix + 'UpLeg', -thigh, side * 0.035)
        self.rotate(prefix + 'Leg', knee)
        self.rotate(prefix + 'Foot', ankle)

    def torso(self, lean=0, rock=0, twist=0):
        self.rotate('Spine02', lean * .28, rock * .40, twist * .24)
        self.rotate('Spine01', lean * .27, rock * .31, twist * .31)
        self.rotate('Spine', lean * .45, rock * .29, twist * .45)

    def head(self, pitch=0, tilt=0, yaw=0):
        self.rotate('neck', pitch * .45, tilt * .4, yaw * .32)
        self.rotate('Head', pitch * .55, tilt * .6, yaw * .68)

    def tail(self, turn=0, curl=0):
        if 'Tail' in self.bones:
            for name, gain in (('Tail', .48), ('Tail02', .33), ('Tail03', .19)):
                self.rotate(name, curl * gain, yaw=turn * gain)

    def key(self, frame):
        self.bones['Hips'].keyframe_insert(data_path='location', frame=frame, group='Hips')
        for bone in self.bones:
            current = bone.rotation_quaternion
            previous = self.previous.get(bone.name)
            if previous is not None and current.dot(previous) < 0:
                current.negate()
            self.previous[bone.name] = current.copy()
            bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=bone.name)


def smooth(t):
    t = min(1, max(0, t))
    return t * t * (3 - 2 * t)


def curve(t, *points):
    for (start, a), (end, b) in zip(points, points[1:]):
        if t <= end:
            return a + (b - a) * smooth((t - start) / (end - start))
    return points[-1][1]


def baseline(puppet, profile, pulse=0, sway=0):
    drop = math.radians(profile.arm_drop)
    puppet.hips(up=.009 * pulse)
    puppet.torso(profile.lean, .035 * sway)
    puppet.head(-.5 * profile.lean + .045 * pulse, .04 * sway, .10 * sway)
    for side in (1, -1):
        puppet.arm(side, drop + .045 * pulse, .23 + .06 * side * sway, .37 + .045 * pulse, .04 * side * sway)
        puppet.leg(side)
    puppet.tail(.18 * sway, .10 * pulse)


def idle_pose(puppet, profile, t, inspect=False):
    phase = t * math.tau
    baseline(puppet, profile, math.sin(phase), math.sin(phase * (1 + inspect)))
    if inspect:
        scan = math.sin(phase) * .28
        puppet.head(-.06 + .13 * math.sin(phase * 2), .11 * math.sin(phase), scan)


def gait_pose(puppet, profile, t, amount, turn=0, reverse=False):
    phase = t * math.tau
    gait = profile.stride * amount
    direction = -1 if reverse else 1
    step = math.sin(phase) * direction
    load = math.cos(phase * 2)
    puppet.hips(up=.028 * gait * (1 - load), pitch=-.055 * gait, roll=.054 * step, yaw=turn * .16)
    puppet.torso(profile.lean + .19 * gait, .075 * step - turn * .10, -.22 * step - turn * .14)
    puppet.head(-.10 - .075 * gait, -.028 * step, turn * .16)
    for side in (1, -1):
        swing = step * side
        lift = max(0, math.cos(phase) * side * direction)
        thigh = swing * .63 * gait + lift * .20 * gait
        knee = (0.06 + lift * .87) * gait
        ankle = thigh - knee + .26 * gait * lift
        puppet.leg(side, thigh, knee, ankle)
        drop = math.radians(profile.arm_drop) + .145 * gait
        puppet.arm(side, drop, .21 - swing * .45 * gait, .41 + .22 * lift, -.12 * swing)
    puppet.tail(-.58 * step - turn * .21, .15 * load)


def gesture_pose(puppet, profile, t, kind):
    drop = math.radians(profile.arm_drop)
    wind = curve(t, (0, 0), (.23, 1), (.45, .2), (.75, 0), (1, 0))
    fire = curve(t, (0, 0), (.30, 0), (.43, 1), (.59, .85), (.87, 0), (1, 0))
    extent = profile.opening
    twist = profile.beam_twist
    if kind == 'beam':
        puppet.hips(up=-.075 * wind, pitch=.09 * wind - .07 * fire)
        puppet.torso(profile.lean - .29 * wind + .24 * fire, .09 * fire, twist * wind - twist * .58 * fire)
        puppet.head(-.62 * wind + .24 * fire, -.10 * wind, -twist * .65 * wind + twist * .46 * fire)
        for side in (1, -1):
            reach = .22 + (.54 + twist * side) * fire * extent - .38 * wind
            puppet.arm(side, drop - .48 * wind - .36 * fire, reach, .45 + .44 * wind - .32 * fire, -.29 * wind)
            puppet.leg(side, .15 * wind, .40 * wind + .09 * fire, -.25 * wind)
    elif kind == 'burst':
        puppet.hips(up=-.073 * wind + .028 * fire, pitch=-.07 * wind)
        puppet.torso(profile.lean + .25 * wind - .52 * fire, twist * .25 * fire, -.13 * twist * wind)
        puppet.head(.36 * wind - .68 * fire, -.15 * twist * fire)
        for side in (1, -1):
            puppet.arm(side, drop + .19 * wind - .93 * extent * fire, .25 + .86 * wind - .29 * fire,
                       .39 + .85 * wind - .28 * fire, -.35 * fire)
            puppet.leg(side, .13 * wind, .35 * wind, -.19 * wind)
    elif kind == 'charge':
        puppet.hips(up=-.11 * wind - .065 * fire, fore=.10 * fire, pitch=-.1 * wind + .25 * fire, yaw=-twist * .3 * wind)
        puppet.torso(profile.lean + .37 * fire, -.16 * fire * twist, twist * .58 * wind - twist * .73 * fire)
        puppet.head(.12 * wind + .37 * fire, .13 * twist * wind, -.23 * twist * fire)
        for side in (1, -1):
            lead = side * twist
            puppet.arm(side, drop - .45 * wind + lead * .21 * fire, .21 - .45 * wind + (1.17 + lead) * fire,
                       .42 + .72 * wind - .32 * fire, -.27 * fire)
            puppet.leg(side, .39 * wind + lead * fire, .57 * wind + .24 * fire, -.14 * wind)
    elif kind == 'ultimate':
        hoist = curve(t, (0, 0), (.20, .15), (.43, 1), (.54, .88), (.75, 0), (1, 0))
        release = curve(t, (0, 0), (.48, 0), (.61, 1), (.73, .49), (1, 0))
        puppet.hips(up=.115 * hoist - .12 * release, pitch=.14 * release)
        puppet.torso(profile.lean - .65 * hoist + .6 * release, .14 * twist * hoist, twist * (.68 * hoist - .72 * release))
        puppet.head(-.59 * hoist + .37 * release, -.18 * twist * hoist, -twist * .50 * hoist)
        for side in (1, -1):
            asymmetry = side * twist
            puppet.arm(side, drop - (1.83 + asymmetry) * hoist * extent - .42 * release,
                       .22 + (.77 - asymmetry) * release, .42 + .45 * hoist - .31 * release, -.5 * hoist)
            puppet.leg(side, .22 * release, .12 * hoist + .51 * release, -.26 * release)
    puppet.tail(twist * wind - twist * 1.65 * fire, .27 * wind - .23 * fire)


def physical_pose(puppet, profile, t, kind):
    baseline(puppet, profile)
    drop = math.radians(profile.arm_drop)
    if kind == 'stomp':
        # Contact at 0.78 seconds within this 1.5 second clip.
        up = curve(t, (0, 0), (.28, 1), (.42, .85), (.52, 0), (1, 0))
        shock = curve(t, (0, 0), (.47, 0), (.52, 1), (.64, .32), (1, 0))
        puppet.hips(up=.044 * up - .072 * shock, roll=-.10 * up)
        puppet.leg(1, .83 * up, 1.12 * up, -.25 * up)
        puppet.leg(-1, .15 * shock, .24 * shock, -.09 * shock)
        puppet.torso(profile.lean - .21 * up + .29 * shock, .11 * up, .13 * up)
        puppet.arm(1, drop - .48 * up, .23 + .82 * up, .44 + .75 * up)
        puppet.arm(-1, drop - .38 * up, .24 - .28 * up, .39 + .45 * up)
        puppet.head(-.30 * up + .17 * shock)
    elif kind == 'punch':
        # One readable impact at 1.15 seconds within this 2.3 second clip.
        wind = curve(t, (0, 0), (.30, 1), (.45, .68), (.50, 0), (1, 0))
        hit = curve(t, (0, 0), (.42, 0), (.50, 1), (.62, .45), (.87, 0), (1, 0))
        lead = 1 if profile.beam_twist > 0 else -1
        puppet.hips(up=-.022 * wind, fore=.061 * hit, yaw=lead * (.19 * wind - .21 * hit))
        puppet.torso(profile.lean + .21 * hit, -lead * .11 * hit, lead * (.42 * wind - .47 * hit))
        puppet.arm(lead, drop - .41 * wind - .51 * hit, .21 - .79 * wind + 1.11 * hit, .41 + .99 * wind - .28 * hit, .25 * hit)
        puppet.arm(-lead, drop - .13 * wind, .25 + .56 * wind - .34 * hit, .43 + .66 * wind + .12 * hit)
        puppet.head(.085 * hit, .05 * lead * wind, -.24 * lead * wind)
    elif kind == 'jump':
        crouch = curve(t, (0, 0), (.16, 1), (.28, 0), (.80, 0), (.90, .66), (1, 0))
        tuck = curve(t, (0, 0), (.21, 0), (.48, 1), (.69, .61), (.85, 0), (1, 0))
        puppet.hips(up=-.18 * crouch + .07 * tuck)
        puppet.torso(profile.lean + .28 * crouch - .33 * tuck)
        for side in (1, -1):
            puppet.leg(side, .46 * crouch + .56 * tuck, .95 * crouch + .72 * tuck, -.49 * crouch)
            puppet.arm(side, drop + .13 * crouch - .51 * tuck, .24 - .72 * crouch + .91 * tuck, .41 + .18 * tuck)
    elif kind in ('death', 'dead'):
        fall = (1 if kind == 'dead' else curve(t, (0, 0), (.19, .07), (.62, .78), (.88, 1), (1, 1)))
        recoil = math.sin(math.pi * fall)
        puppet.hips(up=-HEIGHT_DEATH * fall, pitch=-1.32 * fall, roll=-.24 * fall)
        puppet.torso(profile.lean - .13 * recoil, .15 * fall)
        puppet.head(-.27 * recoil + .12 * fall, .16 * fall)
        for side in (1, -1):
            puppet.leg(side, .26 * recoil, .39 * fall, -.13 * recoil)
            puppet.arm(side, drop - (.27 + side * .14) * fall - .38 * recoil,
                       .21 - .32 * fall + .49 * recoil, .41 + .20 * recoil)
    elif kind == 'victory':
        stance = curve(t, (0, 0), (.24, 1), (.75, 1), (1, 0))
        sway = math.sin(t * math.tau * 2) * stance
        puppet.hips(up=.026 * stance, roll=.085 * sway)
        puppet.torso(profile.lean - .30 * stance, sway * .14, profile.beam_twist * sway * .7)
        puppet.head(-.31 * stance, .11 * sway, -.24 * sway)
        for side in (1, -1):
            puppet.arm(side, drop - (1.30 + .19 * side * sway) * stance, .23 + .54 * stance,
                       .39 + .69 * stance, -.28 * stance)
        puppet.tail(.53 * sway, .22 * stance)


HEIGHT_DEATH = .59


def author_clips(rig, profile):
    scene = bpy.context.scene
    scene.render.fps = FPS
    puppet = Puppet(rig)
    clips = {
        'idle': (2.8, lambda t: idle_pose(puppet, profile, t)),
        'idle2': (3.4, lambda t: idle_pose(puppet, profile, t, inspect=True)),
    }
    for name, duration, amount, turn, reverse in (
        ('walk', 1.48, .43, 0, False), ('run', 1.05, .77, 0, False),
        ('sprint', .88, .94, 0, False), ('sprintFast', .75, 1.08, 0, False),
        ('turnLeft', 1.05, .71, 1, False), ('turnRight', 1.05, .71, -1, False),
        ('walkTurnL', 1.46, .43, 1, False), ('walkTurnR', 1.46, .43, -1, False),
        ('turnSharp', .92, .66, -1.5, False), ('backRight', 1.05, .65, -1, True),
        ('walkBack', 1.55, .38, 0, True), ('walkBackIP', 1.55, .38, 0, True),
    ):
        clips[name] = (duration, lambda t, a=amount, w=turn, r=reverse: gait_pose(puppet, profile, t, a, w, r))
    for name, duration, kind in (
        ('skill1', 1.58, 'beam'), ('skill2', 1.48, 'burst'), ('skill3', 1.24, 'charge'),
        ('cast1', 1.38, 'beam'), ('cast2', 1.75, 'burst'), ('cast3', 2.30, 'ultimate'),
    ):
        clips[name] = (duration, lambda t, k=kind: gesture_pose(puppet, profile, t, k))
    for name, duration, kind in (
        ('stomp', 1.5, 'stomp'), ('punch', 2.3, 'punch'), ('jump', 1.25, 'jump'),
        ('death', 2.1, 'death'), ('dead', .8, 'dead'), ('dance', 2.9, 'victory'), ('cheer', 1.9, 'victory'),
    ):
        clips[name] = (duration, lambda t, k=kind: physical_pose(puppet, profile, t, k))
    animated = rig.animation_data_create()
    for name, (duration, pose) in clips.items():
        action = bpy.data.actions.new(name)
        animated.action = action
        puppet.previous.clear()
        frames = round(duration * FPS)
        for offset in range(frames + 1):
            puppet.reset()
            pose(offset / frames)
            puppet.key(1 + offset)
        slot = animated.action_slot
        animated.action = None
        track = animated.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.action_slot = slot
        track.mute = True
    puppet.reset()
