export type CaseItem = {
  id: string;
  name: string;
  community: string;
  area: number;
  layout: string;
  style: string;
  status: "已上架" | "草稿" | "已下架";
  views: number;
  favorites: number;
  consultations: number;
  cover: string;
  updatedAt: string;
};

export type LeadItem = {
  id: string;
  phone: string;
  community: string;
  layout: string;
  area: string;
  source: string;
  status: "新线索" | "已联系" | "有意向" | "已量房" | "已签约" | "暂不跟进";
  createdAt: string;
  owner: string;
};

export const mockCases: CaseItem[] = [
  {
    id: "case-001",
    name: "保利天汇 128㎡ 现代简约",
    community: "保利天汇",
    area: 128,
    layout: "3室2厅",
    style: "现代简约",
    status: "已上架",
    views: 1268,
    favorites: 86,
    consultations: 18,
    cover: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=600&q=80",
    updatedAt: "2026-07-17",
  },
  {
    id: "case-002",
    name: "金地怡林 98㎡ 原木风",
    community: "金地怡林",
    area: 98,
    layout: "2室2厅",
    style: "原木风",
    status: "已上架",
    views: 932,
    favorites: 61,
    consultations: 12,
    cover: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=600&q=80",
    updatedAt: "2026-07-16",
  },
  {
    id: "case-003",
    name: "中鹏嘉年华 143㎡ 轻奢",
    community: "中鹏嘉年华",
    area: 143,
    layout: "4室2厅",
    style: "轻奢",
    status: "草稿",
    views: 0,
    favorites: 0,
    consultations: 0,
    cover: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=600&q=80",
    updatedAt: "2026-07-15",
  },
  {
    id: "case-004",
    name: "万科城市花园 120㎡ 奶油风",
    community: "万科城市花园",
    area: 120,
    layout: "3室2厅",
    style: "奶油风",
    status: "已下架",
    views: 741,
    favorites: 42,
    consultations: 9,
    cover: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=600&q=80",
    updatedAt: "2026-07-12",
  },
];

export const mockLeads: LeadItem[] = [
  {
    id: "lead-001",
    phone: "138****1234",
    community: "保利天汇",
    layout: "3室2厅",
    area: "128㎡",
    source: "保利天汇 128㎡ 现代简约",
    status: "新线索",
    createdAt: "今天 10:26",
    owner: "未分配",
  },
  {
    id: "lead-002",
    phone: "186****5678",
    community: "金地怡林",
    layout: "2室2厅",
    area: "98㎡",
    source: "金地怡林 98㎡ 原木风",
    status: "已联系",
    createdAt: "昨天 16:42",
    owner: "ChyXin",
  },
  {
    id: "lead-003",
    phone: "159****9012",
    community: "中鹏嘉年华",
    layout: "4室2厅",
    area: "143㎡",
    source: "中鹏嘉年华 143㎡ 轻奢",
    status: "有意向",
    createdAt: "07-15 09:18",
    owner: "ChyXin",
  },
  {
    id: "lead-004",
    phone: "177****3344",
    community: "镜铁小区",
    layout: "3室2厅",
    area: "116㎡",
    source: "首页预约咨询",
    status: "已量房",
    createdAt: "07-14 14:05",
    owner: "ChyXin",
  },
];

export const initialTags = {
  风格: ["现代简约", "奶油风", "原木风", "北欧", "轻奢", "新中式"],
  户型: ["2室2厅", "3室2厅", "4室2厅", "别墅", "其他"],
  面积: ["80㎡以下", "80-100㎡", "100-120㎡", "120-150㎡", "150㎡以上"],
};
