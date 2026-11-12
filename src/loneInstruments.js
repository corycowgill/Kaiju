// Vector instruments use game state exclusively: no baked headings or false altitudes.
const W=512,H=320;
function text(c,value,x,y,size=14,color='#9eb9b2',align='left') {
  c.font=`${size}px monospace`;c.fillStyle=color;c.textAlign=align;c.fillText(value,x,y);
}
function line(c,x,y,x2,y2,color='#587870',width=1) {
  c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();
}
function gauge(c,x,y,label,value,max,unit) {
  const r=56;c.strokeStyle='#293d3d';c.lineWidth=7;c.beginPath();c.arc(x,y,r,Math.PI*.75,Math.PI*2.25);c.stroke();
  c.strokeStyle='#94b8a7';c.beginPath();c.arc(x,y,r,Math.PI*.75,Math.PI*(.75+1.5*Math.min(1,value/max)));c.stroke();
  for(let i=0;i<=10;i++) {
    const a=Math.PI*(.75+i*.15);
    line(c,x+Math.cos(a)*47,y+Math.sin(a)*47,x+Math.cos(a)*52,y+Math.sin(a)*52,'#a9bab0');
  }
  const a=Math.PI*(.75+1.5*Math.min(1,value/max));
  line(c,x,y,x+Math.cos(a)*42,y+Math.sin(a)*42,'#e5d6af',2);
  c.fillStyle='#bfc6b9';c.beginPath();c.arc(x,y,4,0,Math.PI*2);c.fill();
  text(c,label,x,y-18,12,'#9caeaa','center');
  text(c,`${Math.round(value)} ${unit}`,x,y+36,14,'#d1ded2','center');
}
export function drawInstrument(c,kind,s,role) {
  const speed=s.groundSpeed||0,alt=s.pos.y;
  const heading=((s.state.yaw*180/Math.PI)%360+360)%360;
  const target=s.state.kaiju.root.position,range=s.pos.distanceTo(target);
  const hp=Math.max(0,s.hp/s.unit.hp),ready=1-Math.max(0,s.cooldown/s.unit.interval);
  c.fillStyle='#061012';c.fillRect(0,0,W,H);
  c.strokeStyle='#34494b';c.lineWidth=1;c.strokeRect(3,3,506,314);
  text(c,kind==='FLIGHT'?'PRIMARY FLIGHT':kind==='TACTICAL'||kind==='SIGHT'?'TARGET / NAVIGATION':'VEHICLE STATUS',14,22,14,'#a1c4bf');
  text(c,role==='tank'?'GUNNER':'FLIGHT CREW',498,22,11,'#728e8a','right');
  line(c,12,31,500,31);
  if(kind==='FLIGHT') {
    c.save();c.beginPath();c.rect(124,65,264,183);c.clip();
    c.translate(256,158);c.rotate((s.steer||0)*.08);c.translate(0,s.state.pitch*95);
    c.fillStyle='#254e64';c.fillRect(-270,-370,540,370);
    c.fillStyle='#574d38';c.fillRect(-270,0,540,370);
    line(c,-270,0,270,0,'#b5d0cd',2);
    for(let i=-4;i<=4;i++)if(i) {
      const y=i*23;line(c,-(i%2?19:33),y,i%2?19:33,y,'#b6c7c0');
      if(i%2===0){text(c,String(Math.abs(i)*5),-46,y+4,11);text(c,String(Math.abs(i)*5),39,y+4,11);}
    }
    c.restore();
    line(c,211,158,243,158,'#e1ce81',3);line(c,269,158,301,158,'#e1ce81',3);line(c,243,158,256,166,'#e1ce81',3);line(c,256,166,269,158,'#e1ce81',3);
    for(let i=-3;i<=3;i++) {
      const x=256+i*34;line(c,x,40,x,47,'#9dbcb5');
      text(c,String((Math.round(heading/10)*10+i*10+360)%360).padStart(3,'0'),x,59,11,'#9dbcb5','center');
    }
    text(c,'KNOTS',62,92,11,'#6d9995','center');text(c,'FEET',448,92,11,'#6d9995','center');
    for(const [x,value] of [[17,speed*1.944],[405,alt*3.281]]) {
      c.strokeStyle='#a9c5b4';c.strokeRect(x,133,90,43);text(c,String(Math.round(value)),x+45,162,26,'#d9e8d5','center');
    }
    text(c,`HDG ${String(Math.round(heading)).padStart(3,'0')}°`,256,271,17,'#c4d7cd','center');
  } else if(kind==='TACTICAL'||kind==='SIGHT') {
    const cx=238,cy=160,r=108;
    c.save();c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.clip();
    for(let i=-4;i<=4;i++){line(c,cx+i*27,cy-r,cx+i*27,cy+r,'#19342d');line(c,cx-r,cy+i*27,cx+r,cy+i*27,'#19342d');}
    for(const rr of [36,72,108]){c.strokeStyle='#406052';c.beginPath();c.arc(cx,cy,rr,0,Math.PI*2);c.stroke();}
    line(c,cx,cy,cx-55,cy-108,'#587e65');line(c,cx,cy,cx+55,cy-108,'#587e65');
    const bearing=Math.atan2(target.x-s.pos.x,target.z-s.pos.z)-s.state.yaw;
    const radius=Math.min(r-9,Math.hypot(target.x-s.pos.x,target.z-s.pos.z)/200*r);
    const x=cx+Math.sin(bearing)*radius,y=cy-Math.cos(bearing)*radius;
    c.strokeStyle=s.warning>0?'#e1a36c':'#b8c494';c.lineWidth=2;c.strokeRect(x-7,y-7,14,14);
    text(c,'KAIJU',x+13,y+4,11,'#b8c494');
    c.fillStyle='#c8d9b6';c.beginPath();c.moveTo(cx,cy-9);c.lineTo(cx-5,cy+6);c.lineTo(cx+5,cy+6);c.closePath();c.fill();c.restore();
    text(c,'RANGE',374,95,11);text(c,`${Math.round(range)} M`,374,117,20,'#c4d8b0');
    text(c,'BEARING',374,157,11);text(c,`${Math.round(((bearing*180/Math.PI)%360+360)%360)}°`,374,179,20);
    text(c,'SCALE 200 M',14,266,11,'#79978b');text(c,`AZ ${Math.round(heading)}°`,374,229,14);
  } else {
    gauge(c,128,114,'HULL',hp*100,100,'%');gauge(c,375,114,'WEAPON',ready*100,100,'%');
    gauge(c,128,246,'SPEED',speed*1.944,80,'KT');gauge(c,375,246,role==='tank'?'RANGE':'ALTITUDE',role==='tank'?range:alt,role==='tank'?250:80,'M');
  }
  if(kind==='FLIGHT'||kind==='TACTICAL'||kind==='SIGHT') {
    line(c,12,282,500,282);text(c,`HULL ${Math.round(hp*100)}%`,14,303,13,'#91b9a7');
    text(c,s.warning>0?'THREAT / EVADE':ready<.99?'WEAPON CYCLING':'WEAPON READY',498,303,13,s.warning>0?'#e6a36a':'#91b9a7','right');
  }
}
