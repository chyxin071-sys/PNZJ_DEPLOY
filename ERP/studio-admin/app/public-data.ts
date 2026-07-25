export type PublicCase = {
  id: string;
  name: string;
  community: string;
  area: number;
  layout: string;
  style: string;
  cover: string;
  images: string[];
  description: string;
  layoutInfo: string;
  highlights: string;
  tags: string[];
};

const photos = [
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1800&q=88",
  "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1800&q=88",
  "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1800&q=88",
  "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1800&q=88",
  "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1800&q=88",
  "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1800&q=88",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=88",
];

export const publicCases: PublicCase[] = [
  {
    id: "A001",
    name: "保利天汇 128㎡现代简约",
    community: "保利天汇",
    area: 128,
    layout: "3室2厅",
    style: "现代简约",
    cover: photos[0],
    images: photos,
    description: "以温润材质与自然采光为主线，在克制的色彩中建立松弛、耐看的居住氛围。",
    layoutInfo: "三室两厅两卫，客餐厅一体化，动静分区明确，充分保留家庭成员的独立空间。",
    highlights: "无主灯照明、整墙收纳、开放式餐厨与隐藏式家政空间，让日常生活更从容。",
    tags: ["现代简约", "三室两厅", "收纳设计"],
  },
  {
    id: "A002",
    name: "金地怡林 98㎡北欧风",
    community: "金地怡林",
    area: 98,
    layout: "2室2厅",
    style: "北欧",
    cover: photos[1],
    images: [...photos.slice(1), photos[0]],
    description: "自然木色与柔和采光构成轻盈、耐看的日常空间。",
    layoutInfo: "两室两厅一卫，强化公共空间采光与收纳。",
    highlights: "原木柜体、柔和灯光、轻体量家具。",
    tags: ["北欧", "原木", "小户型"],
  },
  {
    id: "A003",
    name: "中鹏嘉年华 143㎡轻奢",
    community: "中鹏嘉年华",
    area: 143,
    layout: "4室2厅",
    style: "轻奢",
    cover: photos[2],
    images: [...photos.slice(2), ...photos.slice(0, 2)],
    description: "以克制的金属与石材纹理，营造改善型住宅的精致感。",
    layoutInfo: "四室两厅两卫，主卧套房与公共会客区相互独立。",
    highlights: "石材背景、无主灯系统与套房主卧。",
    tags: ["轻奢", "改善住宅", "套房主卧"],
  },
  {
    id: "A004",
    name: "万科城市花园 120㎡新中式",
    community: "万科城市花园",
    area: 120,
    layout: "3室2厅",
    style: "新中式",
    cover: photos[3],
    images: [...photos.slice(3), ...photos.slice(0, 3)],
    description: "在现代尺度中融入东方秩序与温润木作。",
    layoutInfo: "三室两厅两卫，南北通透。",
    highlights: "木格栅、留白与茶室一体化。",
    tags: ["新中式", "东方美学"],
  },
];

export function findPublicCase(id: string) {
  return publicCases.find((item) => item.id === id) || publicCases[0];
}
