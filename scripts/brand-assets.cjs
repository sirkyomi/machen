const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');

const root=path.join(__dirname,'..');
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const distanceToSegment=(x,y,[ax,ay,bx,by])=>{
  const dx=bx-ax,dy=by-ay;
  const t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy),0,1);
  return Math.hypot(x-(ax+t*dx),y-(ay+t*dy));
};
const markAt=(x,y)=>{
  const radius=9,nearestX=clamp(x,radius,32-radius),nearestY=clamp(y,radius,32-radius);
  const blue=Math.hypot(x-nearestX,y-nearestY)<=radius;
  const strokes=[[6,24,6,8],[6,8,16,18],[16,18,26,8],[26,8,26,17],[18,22,21.2,25],[21.2,25,28,18]];
  return {blue,white:strokes.some(line=>distanceToSegment(x,y,line)<=1.325)};
};
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let bit=0;bit<8;bit++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
const crc=value=>{let result=0xffffffff;for(const byte of value)result=crcTable[(result^byte)&255]^(result>>>8);return (result^0xffffffff)>>>0;};
const chunk=(name,data)=>{const type=Buffer.from(name),head=Buffer.alloc(8),tail=Buffer.alloc(4);head.writeUInt32BE(data.length,0);type.copy(head,4);tail.writeUInt32BE(crc(Buffer.concat([type,data])),0);return Buffer.concat([head,data,tail]);};
const png=size=>{
  const samples=4,row=Buffer.alloc(1+size*4),pixels=[];
  for(let py=0;py<size;py++){
    row.fill(0);row[0]=0;
    for(let px=0;px<size;px++){
      let blue=0,white=0;
      for(let sy=0;sy<samples;sy++)for(let sx=0;sx<samples;sx++){
        const point=markAt((px+(sx+.5)/samples)*32/size,(py+(sy+.5)/samples)*32/size);
        if(point.white)white++;else if(point.blue)blue++;
      }
      const at=1+px*4,coverage=(blue+white)/(samples*samples);
      row[at]=Math.round((82*blue+255*white)/(samples*samples));
      row[at+1]=Math.round((127*blue+255*white)/(samples*samples));
      row[at+2]=Math.round((234*blue+255*white)/(samples*samples));
      row[at+3]=Math.round(coverage*255);
    }
    pixels.push(Buffer.from(row));
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.concat(pixels))),chunk('IEND',Buffer.alloc(0))]);
};
const ico=entries=>{
  const header=Buffer.alloc(6);header.writeUInt16LE(1,2);header.writeUInt16LE(entries.length,4);let offset=6+entries.length*16;
  const directory=entries.map(({size,data})=>{const entry=Buffer.alloc(16);entry[0]=size===256?0:size;entry[1]=size===256?0:size;entry.writeUInt16LE(1,4);entry.writeUInt16LE(32,6);entry.writeUInt32LE(data.length,8);entry.writeUInt32LE(offset,12);offset+=data.length;return entry;});
  return Buffer.concat([header,...directory,...entries.map(entry=>entry.data)]);
};

const entries=[16,32,48,256].map(size=>({size,data:png(size)}));
fs.writeFileSync(path.join(root,'assets','tray.png'),entries[1].data);
fs.writeFileSync(path.join(root,'assets','app.ico'),ico(entries));
