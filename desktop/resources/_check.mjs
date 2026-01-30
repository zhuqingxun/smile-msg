
import sharp from 'sharp';
const img = sharp('desktop/resources/smile4-透明.png');
const { width, height, channels } = await img.metadata();
console.log('尺寸:', width, 'x', height, '通道数:', channels);
const raw = await img.raw().toBuffer();
// 检查四角像素的 RGBA 值
const px = (x, y) => {
  const i = (y * width + x) * channels;
  return { r: raw[i], g: raw[i+1], b: raw[i+2], a: channels === 4 ? raw[i+3] : 255 };
};
console.log('左上(0,0):', JSON.stringify(px(0, 0)));
console.log('右上(' + (width-1) + ',0):', JSON.stringify(px(width-1, 0)));
console.log('左下(0,' + (height-1) + '):', JSON.stringify(px(0, height-1)));
console.log('右下(' + (width-1) + ',' + (height-1) + '):', JSON.stringify(px(width-1, height-1)));
console.log('中心(' + Math.floor(width/2) + ',' + Math.floor(height/2) + '):', JSON.stringify(px(Math.floor(width/2), Math.floor(height/2))));
// 统计完全透明像素数量
let transparent = 0;
for (let i = 0; i < raw.length; i += channels) {
  if (channels === 4 && raw[i+3] === 0) transparent++;
}
const total = width * height;
console.log('透明像素:', transparent, '/', total, '(' + (transparent/total*100).toFixed(1) + '%)');
