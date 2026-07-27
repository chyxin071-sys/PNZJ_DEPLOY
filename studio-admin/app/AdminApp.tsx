"use client";

import {
  AlignLeft,
  BarChart3,
  Bell,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  FolderKanban,
  Heart,
  Italic,
  LayoutGrid,
  KeyRound,
  List,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Redo2,
  RemoveFormatting,
  RotateCcw,
  Save,
  Search,
  Share2,
  Settings,
  ShieldCheck,
  Star,
  Tags,
  TrendingUp,
  Trash2,
  Underline,
  Undo2,
  Upload,
  UserCog,
  Users,
  X,
} from "lucide-react";
import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { adminApi } from "./admin-api";
import logoFull from "./assets/logo-full.png";
import logoMark from "./assets/logo-mark.png";
import designerQr from "./assets/designer-qr.png";

type AdminSession = {
  token: string;
  mode: "cloud" | "preview";
  admin: {
    username: string;
    displayName: string;
    role: string;
    mustChangePassword?: boolean;
  };
};

const ADMIN_SESSION_KEY = "pnzj-studio-admin-session";

type View =
  | "cases"
  | "case-preview"
  | "case-edit"
  | "customers"
  | "analytics"
  | "notifications"
  | "tags"
  | "admins"
  | "settings";
type CaseScope =
  | "全部案例"
  | "热门小区"
  | "精选案例"
  | "推荐案例"
  | "首页大图";
type SettingsTab = "水印设置" | "品牌资料" | "基础设置";

type CaseRecord = {
  _id?: string;
  id: string;
  name: string;
  community: string;
  area: number;
  layout: string;
  style: string;
  status: "已上架" | "草稿" | "已下架";
  views: number;
  favorites: number;
  shares: number;
  cover: string;
  featured: boolean;
  recommended: boolean;
  hot?: boolean;
  homeHero: boolean;
  images: string[];
  imageNames?: string[];
  imageSections?: { name: string; images: string[]; imageFileIDs?: string[] }[];
  coverFileID?: string;
  imageFileIDs?: string[];
  description: string;
  layoutInfo: string;
  highlights: string;
  tags: string[];
  uploader: string;
  updatedAt?: string;
};

type ImageSection = { name: string; images: string[]; imageFileIDs: string[] };

type Customer = {
  id: string;
  phone: string;
  name: string;
  community: string;
  layout: string;
  area: string;
  source: string;
  status: string;
  category: string;
  createdAt: string;
  openid?: string;
  visitorId?: string;
  nickname?: string;
  avatarFileID?: string;
  decorationStatus?: string;
  question?: string;
  sourceCaseName?: string;
};

type AnalyticsEvent = {
  _id?: string;
  type:
    "case_view" | "favorite_add" | "favorite_remove" | "share" | "consultation";
  caseId?: string;
  caseName?: string;
  openid?: string;
  visitorId?: string;
  nickname?: string;
  avatarFileID?: string;
  phone?: string;
  community?: string;
  createdAt?: string | Date;
};

const photos = [
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=86",
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1400&q=86",
  "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=86",
  "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1400&q=86",
  "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=86",
  "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1400&q=86",
  "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1400&q=86",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=86",
];

const DEFAULT_STYLES = [
  "现代简约",
  "奶油风",
  "原木风",
  "北欧",
  "轻奢",
  "新中式",
];
const DEFAULT_SPACES = ["客厅", "餐厅", "卧室", "厨房", "卫生间", "阳台"];

const initialCases: CaseRecord[] = [
  {
    id: "A001",
    name: "保利天汇 128㎡现代简约",
    community: "保利天汇",
    area: 128,
    layout: "3室2厅",
    style: "现代简约",
    status: "已上架",
    views: 1258,
    favorites: 356,
    shares: 68,
    cover: photos[0],
    featured: true,
    recommended: true,
    homeHero: true,
    images: photos.slice(0, 7),
    description:
      "本案以现代简约为核心，通过低饱和度材质与克制线条建立轻松而有秩序的居住氛围。",
    layoutInfo: "三室两厅两卫，客餐厅一体化，动静分区明确。",
    highlights: "无主灯照明、整墙收纳、开放式餐厨和隐藏式家政空间。",
    tags: [],
    uploader: "PN000",
    updatedAt: "2026-07-18 10:20",
  },
  {
    id: "A002",
    name: "金地怡林 98㎡北欧风",
    community: "金地怡林",
    area: 98,
    layout: "2室2厅",
    style: "北欧",
    status: "已上架",
    views: 986,
    favorites: 214,
    shares: 45,
    cover: photos[1],
    featured: true,
    recommended: true,
    homeHero: false,
    images: photos.slice(1, 7),
    description: "自然木色与柔和采光构成轻盈、耐看的日常空间。",
    layoutInfo: "两室两厅一卫，强化公共空间采光与收纳。",
    highlights: "原木柜体、柔和灯光、轻体量家具。",
    tags: [],
    uploader: "PN000",
    updatedAt: "2026-07-18 10:20",
  },
  {
    id: "A003",
    name: "中鹏嘉年华 143㎡轻奢",
    community: "中鹏嘉年华",
    area: 143,
    layout: "4室2厅",
    style: "轻奢",
    status: "已上架",
    views: 864,
    favorites: 188,
    shares: 36,
    cover: photos[2],
    featured: false,
    recommended: true,
    homeHero: false,
    images: photos.slice(2).concat(photos.slice(0, 2)),
    description: "以克制的金属和石材纹理营造改善型住宅的精致感。",
    layoutInfo: "四室两厅两卫，主卧套房与公共会客区相互独立。",
    highlights: "石材背景、无主灯系统、套房主卧。",
    tags: [],
    uploader: "editor01",
    updatedAt: "2026-07-17 18:30",
  },
  {
    id: "A004",
    name: "万科城市花园 120㎡新中式",
    community: "万科城市花园",
    area: 120,
    layout: "3室2厅",
    style: "新中式",
    status: "草稿",
    views: 0,
    favorites: 0,
    shares: 0,
    cover: photos[3],
    featured: false,
    recommended: false,
    homeHero: false,
    images: photos.slice(3).concat(photos.slice(0, 3)),
    description: "在现代尺度中融入东方秩序与温润木作。",
    layoutInfo: "三室两厅两卫，南北通透。",
    highlights: "木格栅、留白、茶室一体化。",
    tags: [],
    uploader: "PN000",
    updatedAt: "2026-07-16 14:06",
  },
  {
    id: "A005",
    name: "镜铁公馆 166㎡现代简约",
    community: "镜铁公馆",
    area: 166,
    layout: "4室2厅",
    style: "现代简约",
    status: "已下架",
    views: 652,
    favorites: 126,
    shares: 21,
    cover: photos[4],
    featured: false,
    recommended: false,
    homeHero: false,
    images: photos.slice(1),
    description: "围绕长期居住建立克制、耐用的空间秩序。",
    layoutInfo: "四室两厅两卫，双套房设计。",
    highlights: "整墙收纳、开放书房、洄游动线。",
    tags: [],
    uploader: "editor01",
    updatedAt: "2026-07-15 09:12",
  },
];

const initialCustomers: Customer[] = [
  {
    id: "P2026001",
    phone: "13812341234",
    name: "晴天",
    community: "保利天汇",
    layout: "3室2厅",
    area: "128㎡",
    source: "小程序",
    status: "跟进中",
    category: "",
    createdAt: "2026-07-18 10:26",
  },
  {
    id: "P2026002",
    phone: "18656785678",
    name: "木子",
    community: "金地怡林",
    layout: "2室2厅",
    area: "98㎡",
    source: "小程序",
    status: "跟进中",
    category: "",
    createdAt: "2026-07-17 16:42",
  },
  {
    id: "P2026003",
    phone: "15990129012",
    name: "一念",
    community: "中鹏嘉年华",
    layout: "4室2厅",
    area: "143㎡",
    source: "小程序",
    status: "已签单",
    category: "",
    createdAt: "2026-07-16 09:18",
  },
  {
    id: "P2026004",
    phone: "177****3344",
    name: "王先生",
    community: "万科城市花园",
    layout: "3室2厅",
    area: "120㎡",
    source: "ERP录入",
    status: "跟进中",
    category: "报价咨询",
    createdAt: "2026-07-15 09:31",
  },
  {
    id: "P2026005",
    phone: "13924562456",
    name: "小满",
    community: "镜铁公馆",
    layout: "4室2厅",
    area: "166㎡",
    source: "小程序",
    status: "已签单",
    category: "",
    createdAt: "2026-07-14 08:21",
  },
];

function mapLeadToCustomer(record: any): Customer {
  return {
    id: record.customerNo || record._id,
    phone: record.phone || "-",
    name: record.nickname || record.name || record.customerName || "微信客户",
    community: record.community || record.address || "-",
    layout: record.layout || record.miniProgram?.layout || "-",
    area: record.area ? `${record.area}㎡` : "-",
    source:
      record.sourceType === "mini_program" || record.source === "微信小程序"
        ? "小程序"
        : record.source || "-",
    status: record.status || "新客户",
    category: "",
    createdAt:
      typeof record.createdAt === "string"
        ? record.createdAt.replace("T", " ").slice(0, 16)
        : "-",
    openid: record.miniProgram?.openid || "",
    decorationStatus:
      record.miniProgram?.decorationStatus || record.requirementType || "",
    question:
      record.latestConsultQuestion ||
      record.miniProgram?.question ||
      record.remark ||
      "",
    sourceCaseName: record.miniProgram?.sourceCaseName || "",
  };
}

const navItems = [
  { key: "cases" as View, label: "案例管理", icon: FolderKanban },
  { key: "customers" as View, label: "客户管理", icon: Users },
  { key: "analytics" as View, label: "数据统计", icon: BarChart3 },
  { key: "notifications" as View, label: "通知中心", icon: Bell },
  { key: "tags" as View, label: "标签管理", icon: Tags },
  { key: "admins" as View, label: "管理员管理", icon: UserCog },
  { key: "settings" as View, label: "系统设置", icon: Settings },
];

function useEnterToNext() {
  useEffect(() => {
    function handleEnter(event: KeyboardEvent) {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const target = event.target as HTMLElement;
      if (
        !(target instanceof HTMLInputElement) ||
        ["button", "checkbox", "radio", "range", "file"].includes(target.type)
      )
        return;
      const scope =
        target.closest(
          "form, .settings-form, .edit-form, .designer-fields, .filter-bar",
        ) || document;
      const fields = Array.from(
        scope.querySelectorAll<HTMLElement>(
          "input:not([type='hidden']):not([type='file']):not([type='checkbox']):not([type='radio']):not([type='range']):not([disabled]), textarea:not([disabled]), button[data-enter-submit]",
        ),
      );
      const currentIndex = fields.indexOf(target);
      const next = fields[currentIndex + 1];
      if (!next) return;
      event.preventDefault();
      if (next instanceof HTMLButtonElement) next.click();
      else next.focus();
    }
    document.addEventListener("keydown", handleEnter);
    return () => document.removeEventListener("keydown", handleEnter);
  }, []);
}

function Login({ onLogin }: { onLogin: (session: AdminSession) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void adminApi.warmup();
  }, []);
  useEnterToNext();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onLogin(await adminApi.login(username.trim(), password));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page simple-login">
      <section className="login-box">
        <form onSubmit={submit} autoComplete="off">
          <div className="simple-login-brand">
            <img src={logoMark.src} alt="品诺筑家整装" />
            <div>
              <strong>品诺筑家整装</strong>
              <span>PINNUO HOME</span>
            </div>
          </div>
          <div className="login-title">
            <h2>登录管理后台</h2>
            <p>请输入管理员账号与密码</p>
          </div>
          <label>
            <span>管理员账号</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              placeholder="请输入管理员账号"
              autoFocus
            />
          </label>
          <label>
            <span>登录密码</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="请输入密码"
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button data-enter-submit className="gold-button" disabled={loading}>
            {loading ? "正在验证..." : "登录"}
          </button>
          <p className="secure-note">
            <ShieldCheck size={15} />
            管理员安全登录
          </p>
        </form>
      </section>
    </main>
  );
}

function SmartSelect({
  value,
  options,
  onChange,
  placeholder = "请选择",
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`smart-select ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="select-trigger"
        onClick={() => setOpen(true)}
      >
        <span>{value || placeholder}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <button
            className="select-backdrop"
            aria-label="关闭"
            onClick={() => setOpen(false)}
          />
          <div className="select-menu">
            <div className="select-mobile-head">
              <strong>{placeholder}</strong>
              <button onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            {options.map((option) => (
              <button
                type="button"
                key={option}
                className={option === value ? "active" : ""}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <span>{option}</span>
                {option === value && <Check size={15} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ImageLightbox({
  images,
  index,
  close,
  setIndex,
}: {
  images: string[];
  index: number;
  close: () => void;
  setIndex: (index: number) => void;
}) {
  const previous = () => setIndex((index - 1 + images.length) % images.length);
  const next = () => setIndex((index + 1) % images.length);
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  });
  return (
    <div className="image-lightbox" role="dialog" aria-modal="true">
      <button className="lightbox-backdrop" onClick={close} />
      <div className="lightbox-stage">
        <img src={images[index]} alt={`案例图片 ${index + 1}`} />
        <span>
          {index + 1} / {images.length}
        </span>
      </div>
      <button className="lightbox-close" onClick={close}>
        <X size={23} />
      </button>
      {images.length > 1 && (
        <>
          <button className="lightbox-arrow previous" onClick={previous}>
            <ChevronLeft size={30} />
          </button>
          <button className="lightbox-arrow next" onClick={next}>
            <ChevronRight size={30} />
          </button>
        </>
      )}
    </div>
  );
}

function CoverCropper({
  file,
  close,
  confirm,
}: {
  file: File;
  close: () => void;
  confirm: (file: File) => void;
}) {
  const [source, setSource] = useState("");
  const [focusX, setFocusX] = useState(50);
  const [focusY, setFocusY] = useState(50);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function crop() {
    const image = imageRef.current;
    if (!image) return;
    const targetRatio = 16 / 9;
    let sx = 0,
      sy = 0,
      sw = image.naturalWidth,
      sh = image.naturalHeight;
    if (sw / sh > targetRatio) {
      sw = sh * targetRatio;
      sx = ((image.naturalWidth - sw) * focusX) / 100;
    } else {
      sh = sw / targetRatio;
      sy = ((image.naturalHeight - sh) * focusY) / 100;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    canvas.getContext("2d")?.drawImage(image, sx, sy, sw, sh, 0, 0, 1600, 900);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (blob)
      confirm(
        new File([blob], file.name.replace(/\.[^.]+$/, "") + "-16x9.jpg", {
          type: "image/jpeg",
        }),
      );
  }
  return (
    <div className="dialog-layer crop-layer">
      <button className="dialog-backdrop" onClick={close} />
      <section className="cover-cropper">
        <header>
          <div>
            <h3>裁剪案例封面</h3>
            <p>输出尺寸 1600 × 900px</p>
          </div>
          <button onClick={close}>
            <X size={20} />
          </button>
        </header>
        <div className="crop-stage">
          {source ? (
            <img
              ref={imageRef}
              src={source}
              alt=""
              style={{ objectPosition: `${focusX}% ${focusY}%` }}
            />
          ) : (
            <div className="crop-placeholder">正在读取图片</div>
          )}
        </div>
        <div className="crop-controls">
          <label>
            <span>水平焦点</span>
            <input
              type="range"
              min="0"
              max="100"
              value={focusX}
              onChange={(event) => setFocusX(Number(event.target.value))}
            />
            <b>{focusX}%</b>
          </label>
          <label>
            <span>垂直焦点</span>
            <input
              type="range"
              min="0"
              max="100"
              value={focusY}
              onChange={(event) => setFocusY(Number(event.target.value))}
            />
            <b>{focusY}%</b>
          </label>
        </div>
        <footer>
          <button className="line-button" onClick={close}>
            取消
          </button>
          <button className="gold-button" onClick={() => void crop()}>
            应用裁剪
          </button>
        </footer>
      </section>
    </div>
  );
}

function CommunityPicker({
  value,
  options,
  close,
  select,
  title = "选择小区",
  description = "选择已有小区，或添加一个新的小区名称",
  searchPlaceholder = "搜索小区",
  customPlaceholder = "输入自定义小区",
}: {
  value: string;
  options: string[];
  close: () => void;
  select: (value: string) => void;
  title?: string;
  description?: string;
  searchPlaceholder?: string;
  customPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const filtered = options.filter((item) => item.includes(query.trim()));
  return (
    <div className="picker-layer">
      <button className="picker-backdrop" onClick={close} />
      <section className="community-picker">
        <header>
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <button onClick={close}>
            <X size={20} />
          </button>
        </header>
        <div className="community-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
          />
        </div>
        <div className="community-options">
          {filtered.map((item) => (
            <button
              className={item === value ? "active" : ""}
              key={item}
              onClick={() => select(item)}
            >
              <span>{item}</span>
              {item === value && <Check size={16} />}
            </button>
          ))}
        </div>
        <footer>
          <input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder={customPlaceholder}
          />
          <button
            className="gold-button"
            disabled={!custom.trim()}
            onClick={() => custom.trim() && select(custom.trim())}
          >
            添加并选择
          </button>
        </footer>
      </section>
    </div>
  );
}

function KeywordInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const entries = raw
      .split(/[，,、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!entries.length) return;
    onChange(Array.from(new Set([...value, ...entries])).slice(0, 20));
    setDraft("");
  }

  return (
    <div className="keyword-input-box">
      <div className="keyword-chip-list">
        {value.map((tag) => (
          <span className="keyword-chip" key={tag}>
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== tag))}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => add(draft)}
          onKeyDown={(event) => {
            if (["Enter", "Tab", ","].includes(event.key)) {
              event.preventDefault();
              add(draft);
            }
          }}
          placeholder={value.length ? "继续输入关键词" : "输入关键词后按回车"}
        />
      </div>
      <small>
        例如：无主灯、开放餐厨、亲子收纳。输入后按回车自动生成标签。
      </small>
    </div>
  );
}

function ConfirmAction({
  title,
  text,
  cancel,
  confirm,
  confirmLabel = "确认删除",
  danger = true,
}: {
  title: string;
  text: string;
  cancel: () => void;
  confirm: () => void;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <div className="dialog-layer">
      <button className="dialog-backdrop" onClick={cancel} />
      <section className="confirm-dialog">
        <h3>{title}</h3>
        <p>{text}</p>
        <div>
          <button className="line-button" onClick={cancel}>
            取消
          </button>
          <button
            className={danger ? "danger-button" : "gold-button"}
            onClick={confirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function TextInputDialog({
  title,
  label,
  value,
  close,
  confirm,
}: {
  title: string;
  label: string;
  value: string;
  close: () => void;
  confirm: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="dialog-layer">
      <button className="dialog-backdrop" onClick={close} />
      <form
        className="text-input-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) confirm(draft.trim());
        }}
      >
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={close}>
            <X size={19} />
          </button>
        </header>
        <label>
          <span>{label}</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
          />
        </label>
        <footer>
          <button type="button" className="line-button" onClick={close}>
            取消
          </button>
          <button className="gold-button">保存</button>
        </footer>
      </form>
    </div>
  );
}

function ChangePasswordDialog({
  session,
  close,
  complete,
  notify,
}: {
  session: AdminSession;
  close: () => void;
  complete: () => void;
  notify: (message: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isFirstLogin = Boolean(session.admin.mustChangePassword);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (nextPassword.length < 6) {
      notify("新密码至少需要6位");
      return;
    }
    if (nextPassword !== confirmPassword) {
      notify("两次输入的新密码不一致");
      return;
    }
    if (session.mode === "cloud")
      await adminApi.changePassword(
        session.token,
        currentPassword,
        nextPassword,
      );
    notify("密码已修改，请重新登录");
    complete();
  }
  return (
    <div className="dialog-layer">
      <button className="dialog-backdrop" onClick={close} />
      <form
        className="admin-editor password-editor"
        onSubmit={(event) => void submit(event)}
      >
        <header>
          <div>
            <h3>{isFirstLogin ? "首次登录，建议修改密码" : "修改登录密码"}</h3>
            <p>
              {isFirstLogin
                ? "可以暂时取消并继续使用。新密码至少 6 位，修改成功后请重新登录。"
                : "修改成功后，当前账号将在所有设备退出登录"}
            </p>
          </div>
          <button type="button" onClick={close}>
            <X size={20} />
          </button>
        </header>
        <div className="admin-editor-fields">
          <label>
            <span>{isFirstLogin ? "初始密码" : "当前密码"}</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoFocus
            />
          </label>
          <label>
            <span>新密码</span>
            <input
              type="password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
            />
          </label>
          <label>
            <span>确认新密码</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
        </div>
        <footer>
          <button type="button" className="line-button" onClick={close}>
            暂时取消
          </button>
          <button className="gold-button">确认修改</button>
        </footer>
      </form>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const tone =
    value.includes("上架") ||
    value.includes("签约") ||
    value.includes("签单") ||
    value === "正常"
      ? "green"
      : value.includes("下架") || value.includes("流失") || value === "停用"
        ? "red"
        : value.includes("跟进") ||
            value.includes("联系") ||
            value.includes("意向")
          ? "blue"
          : value.includes("草稿") || value.includes("新")
            ? "gold"
            : "gray";
  return <span className={`status ${tone}`}>{value}</span>;
}

function Pager({ total = 36 }: { total?: number }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(total / 20));
  return (
    <div className="pager">
      <span>共 {total} 条</span>
      <button onClick={() => setPage(Math.max(1, page - 1))}>
        <ChevronLeft size={14} />
      </button>
      {Array.from({ length: Math.min(5, pages) }, (_, index) => index + 1).map(
        (item) => (
          <button
            className={page === item ? "active" : ""}
            onClick={() => setPage(item)}
            key={item}
          >
            {item}
          </button>
        ),
      )}
      <button onClick={() => setPage(Math.min(pages, page + 1))}>
        <ChevronRight size={14} />
      </button>
      <strong>20条/页</strong>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <FolderKanban size={26} />
      <strong>{text}</strong>
      <span>可从“全部案例”中设置展示位置</span>
    </div>
  );
}

function CaseActions({
  item,
  canEdit,
  open,
  requestAction,
}: {
  item: CaseRecord;
  canEdit: boolean;
  open: (view: View, item?: CaseRecord) => void;
  requestAction: (
    item: CaseRecord,
    action: "status" | "hot" | "home" | "delete",
  ) => void;
}) {
  return (
    <div
      className="case-quick-actions"
      onClick={(event) => event.stopPropagation()}
    >
      <button onClick={() => open("case-preview", item)}>查看</button>
      {canEdit && (
        <>
          <button onClick={() => open("case-edit", item)}>编辑</button>
          <button onClick={() => requestAction(item, "status")}>
            {item.status === "已下架" ? "上架" : "下架"}
          </button>
          {item.status === "已上架" && (
            <>
              <button onClick={() => requestAction(item, "hot")}>
                {item.hot ? "取消热门" : "设为热门"}
              </button>
              <button onClick={() => requestAction(item, "home")}>
                {item.homeHero ? "取消首页" : "首页展示"}
              </button>
            </>
          )}
          <button
            className="danger"
            onClick={() => requestAction(item, "delete")}
          >
            删除
          </button>
        </>
      )}
    </div>
  );
}

function CasesList({
  cases,
  styles,
  currentAdmin,
  deleteCase,
  persistCasePatch,
  open,
  notify,
}: {
  cases: CaseRecord[];
  styles: string[];
  currentAdmin: AdminSession["admin"];
  deleteCase: (id: string) => Promise<void>;
  persistCasePatch: (
    item: CaseRecord,
    patch: Partial<CaseRecord>,
  ) => Promise<void>;
  open: (view: View, item?: CaseRecord) => void;
  notify: (message: string) => void;
}) {
  const [scope, setScope] = useState<CaseScope>("全部案例");
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("全部");
  const [status, setStatus] = useState("全部");
  const [ownerScope, setOwnerScope] = useState("全部");
  const [deleteCaseId, setDeleteCaseId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    item: CaseRecord;
    action: "status" | "hot" | "home";
  } | null>(null);
  const scopes: CaseScope[] = [
    "全部案例",
    "热门小区",
    "精选案例",
    "推荐案例",
    "首页大图",
  ];

  const filtered = cases.filter((item) => {
    const scopeMatch =
      scope === "全部案例" ||
      (scope === "热门小区" && item.hot) ||
      (scope === "精选案例" && item.featured) ||
      (scope === "推荐案例" && item.recommended) ||
      (scope === "首页大图" && item.homeHero);
    return (
      scopeMatch &&
      (ownerScope === "全部" || item.uploader === currentAdmin.username) &&
      `${item.name}${item.community}`.includes(query) &&
      (style === "全部" || item.style === style) &&
      (status === "全部" || item.status === status)
    );
  });

  function removeCase(id: string) {
    setDeleteCaseId(id);
  }

  function requestAction(
    item: CaseRecord,
    action: "status" | "hot" | "home" | "delete",
  ) {
    if (action === "delete") removeCase(item.id);
    else setPendingAction({ item, action });
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    const { item, action } = pendingAction;
    setPendingAction(null);
    try {
      if (action === "status") {
        const nextStatus = item.status === "已下架" ? "已上架" : "已下架";
        await persistCasePatch(
          item,
          nextStatus === "已上架"
            ? { status: nextStatus }
            : {
                status: nextStatus,
                featured: false,
                recommended: false,
                hot: false,
                homeHero: false,
              },
        );
        notify(`案例已${nextStatus === "已上架" ? "上架" : "下架"}`);
      } else if (action === "hot") {
        if (item.status !== "已上架") {
          notify("请先上架案例，再设置热门小区");
          return;
        }
        if (!item.hot && cases.filter((record) => record.hot).length >= 10) {
          notify("热门小区案例最多设置10个，请先取消一个");
          return;
        }
        await persistCasePatch(item, { hot: !item.hot });
        notify(item.hot ? "已取消热门小区展示" : "已加入热门小区案例");
      } else {
        if (item.status !== "已上架") {
          notify("请先上架案例，再设置首页展示");
          return;
        }
        await persistCasePatch(item, { homeHero: !item.homeHero });
        notify(item.homeHero ? "已取消首页展示" : "首页展示案例已更新");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "操作失败，请稍后重试");
    }
  }

  return (
    <section className="page-section">
      <div className="case-list-toolbar">
        <div className="scope-tabs">
          {scopes.map((item) => (
            <button
              key={item}
              className={scope === item ? "active" : ""}
              onClick={() => setScope(item)}
            >
              {item}
              <span>
                {item === "全部案例"
                  ? cases.length
                  : cases.filter((record) =>
                      item === "热门小区"
                        ? record.hot
                        : item === "精选案例"
                        ? record.featured
                        : item === "推荐案例"
                          ? record.recommended
                          : record.homeHero,
                    ).length}
              </span>
            </button>
          ))}
        </div>
        <button className="gold-button" onClick={() => open("case-edit")}>
          <Plus size={16} />
          新建案例
        </button>
      </div>
      {scope === "首页大图" && (
        <div className="placement-note">
          <Star size={15} />
          <div>
            <strong>小程序首页大图</strong>
            <span>
              首页首屏只展示一个主案例。设置新的首页大图后，原案例会自动取消。
            </span>
          </div>
        </div>
      )}
      <div className="filter-bar">
        <div className="owner-segment">
          <button
            className={ownerScope === "全部" ? "active" : ""}
            onClick={() => setOwnerScope("全部")}
          >
            全部
          </button>
          <button
            className={ownerScope === "我的" ? "active" : ""}
            onClick={() => setOwnerScope("我的")}
          >
            我的
          </button>
        </div>
        <label>
          <span>小区名称</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="请输入"
          />
        </label>
        <label>
          <span>风格</span>
          <SmartSelect
            value={style}
            options={["全部", ...styles]}
            onChange={setStyle}
          />
        </label>
        <label>
          <span>状态</span>
          <SmartSelect
            value={status}
            options={["全部", "已上架", "草稿", "已下架"]}
            onChange={setStatus}
          />
        </label>
        <button
          data-enter-submit
          className="search-button"
          onClick={() => notify(`已筛选出 ${filtered.length} 个案例`)}
        >
          <Search size={15} />
          查询
        </button>
        <button
          className="plain-button"
          onClick={() => {
            setQuery("");
            setStyle("全部");
            setStatus("全部");
            setOwnerScope("全部");
          }}
        >
          <RotateCcw size={14} />
          重置
        </button>
      </div>
      <div className="mobile-case-list">
        {filtered.map((item) => {
          const canEdit =
            currentAdmin.role === "超级管理员" ||
            item.uploader === currentAdmin.username;
          return (
            <article key={item.id} onClick={() => open("case-preview", item)}>
              <img src={item.cover} alt="" />
              <div className="mobile-card-main">
                <div>
                  <strong>{item.name}</strong>
                  <Status value={item.status} />
                </div>
                <p>
                  {item.community} · {item.style}
                </p>
                <div className="placement-tags">
                  {item.hot && <span className="hot">热门</span>}
                  {item.featured && <span className="featured">精选</span>}
                  {item.recommended && (
                    <span className="recommended">推荐</span>
                  )}
                  {item.homeHero && <span className="hero">首页</span>}
                </div>
                <footer onClick={(event) => event.stopPropagation()}>
                  <CaseActions
                    item={item}
                    canEdit={canEdit}
                    open={open}
                    requestAction={requestAction}
                  />
                </footer>
              </div>
            </article>
          );
        })}
      </div>
      {filtered.length === 0 ? (
        <EmptyState text={`暂无${scope}`} />
      ) : (
        <div className="data-table case-table desktop-table">
          <table>
            <colgroup>
              <col className="case-col-name" />
              <col className="case-col-community" />
              <col className="case-col-style" />
              <col className="case-col-placement" />
              <col className="case-col-status" />
              <col className="case-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>案例</th>
                <th>小区</th>
                <th>风格</th>
                <th>展示位</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const canEdit =
                  currentAdmin.role === "超级管理员" ||
                  item.uploader === currentAdmin.username;
                return (
                  <tr
                    className="clickable-row"
                    onClick={() => open("case-preview", item)}
                    key={item.id}
                  >
                    <td>
                      <div className="case-name-entry">
                        <img src={item.cover} alt="" />
                        <strong>{item.name}</strong>
                      </div>
                    </td>
                    <td>{item.community}</td>
                    <td>{item.style}</td>
                    <td>
                      <div className="placement-tags">
                        {item.hot && <span className="hot">热门</span>}
                        {item.featured && (
                          <span className="featured">精选</span>
                        )}
                        {item.recommended && (
                          <span className="recommended">推荐</span>
                        )}
                        {item.homeHero && <span className="hero">首页</span>}
                      </div>
                    </td>
                    <td>
                      <Status value={item.status} />
                    </td>
                    <td>
                      <CaseActions
                        item={item}
                        canEdit={canEdit}
                        open={open}
                        requestAction={requestAction}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pager total={filtered.length} />
        </div>
      )}
      {pendingAction && (
        <ConfirmAction
          title={
            pendingAction.action === "status"
              ? `${pendingAction.item.status === "已下架" ? "上架" : "下架"}这个案例？`
              : pendingAction.action === "hot"
                ? pendingAction.item.hot
                  ? "取消热门小区展示？"
                  : "加入热门小区案例？"
              : pendingAction.item.homeHero
                ? "取消首页展示？"
                : "设为首页展示案例？"
          }
          text={
            pendingAction.action === "status"
              ? "状态变更后会立即影响小程序与网页版的可见性。"
              : pendingAction.action === "hot"
                ? "小程序首页最多展示10个热门小区案例。"
              : "首页首屏仅展示一个主案例，确认后会替换当前首页案例。"
          }
          cancel={() => setPendingAction(null)}
          confirm={() => void confirmPendingAction()}
          confirmLabel="确认操作"
          danger={false}
        />
      )}
      {deleteCaseId && (
        <ConfirmAction
          title="删除这个案例？"
          text="案例及其展示配置将被删除，此操作不可恢复。"
          cancel={() => setDeleteCaseId(null)}
          confirm={() => {
            const id = deleteCaseId;
            setDeleteCaseId(null);
            void deleteCase(id);
          }}
        />
      )}
    </section>
  );
}

function CaseFacts({
  item,
  mobile = false,
}: {
  item: CaseRecord;
  mobile?: boolean;
}) {
  return (
    <aside
      className={`case-facts redesigned ${mobile ? "mobile-case-facts" : "desktop-case-facts"}`}
    >
      <div className="case-fact-title">
        <span>案例信息</span>
        <strong>{item.name}</strong>
      </div>
      <dl>
        <div>
          <dt>所属小区</dt>
          <dd>{item.community}</dd>
        </div>
        <div>
          <dt>户型面积</dt>
          <dd>
            {item.layout} · {item.area}㎡
          </dd>
        </div>
        <div>
          <dt>设计风格</dt>
          <dd>{item.style}</dd>
        </div>
        <div>
          <dt>案例状态</dt>
          <dd>
            <Status value={item.status} />
          </dd>
        </div>
        <div>
          <dt>上传账号</dt>
          <dd>{item.uploader}</dd>
        </div>
      </dl>
      {item.tags.length > 0 && (
        <div className="case-fact-keywords">
          {item.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
      <div className="case-metrics">
        <div>
          <strong>{item.views.toLocaleString()}</strong>
          <span>浏览</span>
        </div>
        <div>
          <strong>{item.favorites.toLocaleString()}</strong>
          <span>收藏</span>
        </div>
        <div>
          <strong>{item.shares.toLocaleString()}</strong>
          <span>分享</span>
        </div>
      </div>
      <p className="case-updated">
        更新于 {item.updatedAt || "2026-07-18 10:20"}
      </p>
    </aside>
  );
}

function CasePreview({
  item,
  canEdit,
  back,
  edit,
  notify,
}: {
  item: CaseRecord;
  canEdit: boolean;
  back: () => void;
  edit: () => void;
  notify: (message: string) => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const images = item.images?.length ? item.images : [item.cover];
  const sections =
    item.imageSections?.filter(
      (section) => section.name && section.images.length,
    ) || [];
  const sectionImages = sections.flatMap((section) => section.images);
  const previewImages = [
    item.cover,
    ...(sectionImages.length
      ? sectionImages
      : images.filter((image) => image !== item.cover)),
  ];
  return (
    <section className="page-section case-detail-page">
      <div className="subpage-head">
        <button className="back-button" onClick={back}>
          <ChevronLeft size={17} />
          返回案例列表
        </button>
        <div>
          {canEdit && (
            <button className="gold-button" onClick={edit}>
              <Edit3 size={16} />
              编辑案例
            </button>
          )}
          <button
            className="line-button"
            onClick={() => {
              window.open(`/case/${item.id}`, "_blank", "noopener,noreferrer");
              notify("已在新窗口打开网页版案例");
            }}
          >
            <Eye size={16} />
            浏览网页版
          </button>
        </div>
      </div>
      <div className="case-detail-layout">
        <div className="case-detail-main">
          <div className="gallery">
            <button
              className="gallery-main-button"
              onClick={() => setLightboxIndex(0)}
            >
              <img className="gallery-main" src={item.cover} alt={item.name} />
              <span>点击查看封面</span>
            </button>
          </div>
          <CaseFacts item={item} mobile />
          <article className="case-story">
            <section>
              <span>01</span>
              <div>
                <h2>案例说明</h2>
                <div
                  dangerouslySetInnerHTML={{
                    __html: item.description || "暂无案例说明",
                  }}
                />
              </div>
            </section>
            <section>
              <span>02</span>
              <div>
                <h2>户型信息</h2>
                <div
                  dangerouslySetInnerHTML={{
                    __html: item.layoutInfo || "暂无户型信息",
                  }}
                />
              </div>
            </section>
            <section>
              <span>03</span>
              <div>
                <h2>设计亮点</h2>
                <div
                  dangerouslySetInnerHTML={{
                    __html: item.highlights || "暂无设计亮点",
                  }}
                />
              </div>
            </section>
          </article>
          {sections.length > 0 ? (
            <div className="admin-preview-sections">
              {sections.map((section, sectionIndex) => {
                const offset =
                  1 +
                  sections
                    .slice(0, sectionIndex)
                    .reduce((sum, current) => sum + current.images.length, 0);
                return (
                  <section key={`${section.name}-${sectionIndex}`}>
                    <header>
                      <span>
                        SPACE {String(sectionIndex + 1).padStart(2, "0")}
                      </span>
                      <h2>{section.name}</h2>
                    </header>
                    <div>
                      {section.images.map((image, imageIndex) => (
                        <button
                          key={`${image}-${imageIndex}`}
                          onClick={() => setLightboxIndex(offset + imageIndex)}
                        >
                          <img src={image} alt={section.name} />
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="admin-preview-sections legacy">
              <section>
                <header>
                  <span>GALLERY</span>
                  <h2>案例图片</h2>
                </header>
                <div>
                  {images.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      onClick={() =>
                        setLightboxIndex(previewImages.indexOf(image))
                      }
                    >
                      <img src={image} alt="" />
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
          <div className="case-detail-brand-end">
            <img src={logoFull.src} alt="品诺筑家整装" />
            <div>
              <p>预约专属设计咨询</p>
              <span>扫码添加设计顾问</span>
            </div>
            <img
              className="brand-end-qr"
              src={designerQr.src}
              alt="咨询二维码"
            />
          </div>
        </div>
        <CaseFacts item={item} />
      </div>
      {lightboxIndex !== null && (
        <ImageLightbox
          images={previewImages}
          index={Math.min(lightboxIndex, previewImages.length - 1)}
          setIndex={setLightboxIndex}
          close={() => setLightboxIndex(null)}
        />
      )}
    </section>
  );
}

function RichEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState("14px");
  const [letterSpacing, setLetterSpacing] = useState("0px");
  const [lineHeight, setLineHeight] = useState("1.8");

  function command(name: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(name, false, value);
  }

  useEffect(() => {
    if (
      editorRef.current &&
      document.activeElement !== editorRef.current &&
      editorRef.current.innerHTML !== value
    ) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  return (
    <div className="rich-editor">
      <div className="editor-toolbar">
        <button type="button" title="撤销" onClick={() => command("undo")}>
          <Undo2 size={15} />
        </button>
        <button type="button" title="重做" onClick={() => command("redo")}>
          <Redo2 size={15} />
        </button>
        <i />
        <button type="button" title="加粗" onClick={() => command("bold")}>
          <Bold size={15} />
        </button>
        <button type="button" title="斜体" onClick={() => command("italic")}>
          <Italic size={15} />
        </button>
        <button
          type="button"
          title="下划线"
          onClick={() => command("underline")}
        >
          <Underline size={15} />
        </button>
        <button
          type="button"
          title="左对齐"
          onClick={() => command("justifyLeft")}
        >
          <AlignLeft size={15} />
        </button>
        <button
          type="button"
          title="列表"
          onClick={() => command("insertUnorderedList")}
        >
          <List size={15} />
        </button>
        <button
          type="button"
          title="清除格式"
          onClick={() => command("removeFormat")}
        >
          <RemoveFormatting size={15} />
        </button>
        <div className="editor-select">
          <SmartSelect
            value={fontSize}
            options={["12px", "14px", "16px", "18px", "20px", "24px"]}
            onChange={setFontSize}
          />
        </div>
        <div className="editor-select">
          <SmartSelect
            value={`字距 ${letterSpacing}`}
            options={[
              "字距 0px",
              "字距 1px",
              "字距 2px",
              "字距 3px",
              "字距 4px",
            ]}
            onChange={(next) => setLetterSpacing(next.replace("字距 ", ""))}
          />
        </div>
        <div className="editor-select">
          <SmartSelect
            value={`行高 ${lineHeight}`}
            options={["行高 1.5", "行高 1.8", "行高 2", "行高 2.4"]}
            onChange={(next) => setLineHeight(next.replace("行高 ", ""))}
          />
        </div>
      </div>
      <div
        ref={editorRef}
        className="editor-content"
        contentEditable
        suppressContentEditableWarning
        style={{ fontSize, letterSpacing, lineHeight }}
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
      />
      <div className="editor-foot">
        <span>支持基础文字排版与换行</span>
        <span>{value.replace(/<[^>]+>/g, "").length} / 2000</span>
      </div>
    </div>
  );
}

function CaseEdit({
  item,
  back,
  save,
  notify,
  communities,
  styles,
  spaces,
  currentUsername,
  addCommunity,
  addStyle,
  addSpace,
  uploadAsset,
}: {
  item?: CaseRecord;
  back: () => void;
  save: (item: CaseRecord) => Promise<void>;
  notify: (message: string) => void;
  communities: string[];
  styles: string[];
  spaces: string[];
  currentUsername: string;
  addCommunity: (value: string) => void;
  addStyle: (value: string) => void;
  addSpace: (value: string) => Promise<void>;
  uploadAsset: (file: File) => Promise<string>;
}) {
  const [name, setName] = useState(item?.name || "");
  const [community, setCommunity] = useState(item?.community || "");
  const [area, setArea] = useState(String(item?.area || ""));
  const layoutMatch = item?.layout.match(/(\d+)室(\d+)厅/) || [];
  const [rooms, setRooms] = useState(layoutMatch[1] || "3");
  const [halls, setHalls] = useState(layoutMatch[2] || "2");
  const [baths, setBaths] = useState("2");
  const [style, setStyle] = useState(item?.style || "现代简约");
  const [status, setStatus] = useState<CaseRecord["status"]>(
    item?.status || "草稿",
  );
  const [cover, setCover] = useState(item?.cover || "");
  const [coverFileID, setCoverFileID] = useState(
    item?.coverFileID || item?.cover || "",
  );
  const [images, setImages] = useState(item?.images || []);
  const [imageFileIDs, setImageFileIDs] = useState(
    item?.imageFileIDs || item?.images || [],
  );
  const [imageNames, setImageNames] = useState<string[]>(() =>
    (item?.imageNames || []).slice(0, item?.images.length || 0),
  );
  const [imageSections, setImageSections] = useState<ImageSection[]>(() => {
    if (item?.imageSections?.length) {
      return item.imageSections.map((section) => ({
        name: section.name || "",
        images: section.images || [],
        imageFileIDs: section.imageFileIDs || section.images || [],
      }));
    }
    if (item?.images?.length) {
      return [
        {
          name: "",
          images: item.images,
          imageFileIDs: item.imageFileIDs || item.images,
        },
      ];
    }
    return [];
  });
  const [sectionDragging, setSectionDragging] = useState(false);
  const [sectionDragItem, setSectionDragItem] = useState<{
    section: number;
    image: number;
  } | null>(null);
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(
    null,
  );
  const [sectionUploading, setSectionUploading] = useState<
    Record<number, string[]>
  >({});
  const [sectionDeleteIndex, setSectionDeleteIndex] = useState<{
    section: number;
    image: number;
  } | null>(null);
  const [galleryDragging, setGalleryDragging] = useState(false);
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(
    null,
  );
  const draggedImageIndexRef = useRef<number | null>(null);
  const [assetPreviews, setAssetPreviews] = useState<Record<string, string>>(
    () => {
      const previews: Record<string, string> = {};
      if (item?.coverFileID && item.cover)
        previews[item.coverFileID] = item.cover;
      (item?.imageFileIDs || []).forEach((fileID, index) => {
        if (item.images[index]) previews[fileID] = item.images[index];
      });
      return previews;
    },
  );
  const [uploadingImages, setUploadingImages] = useState<string[]>([]);
  const [coverDragging, setCoverDragging] = useState(false);
  const [description, setDescription] = useState(item?.description || "");
  const [layoutInfo, setLayoutInfo] = useState(item?.layoutInfo || "");
  const [highlights, setHighlights] = useState(item?.highlights || "");
  const [selectedTags, setSelectedTags] = useState<string[]>(item?.tags || []);
  const [contentTab, setContentTab] = useState("案例说明");
  const [communityOpen, setCommunityOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [coverPreviewOpen, setCoverPreviewOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    event.target.value = "";
  }

  function handleCoverDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setCoverDragging(false);
    const file = Array.from(event.dataTransfer.files).find((item) =>
      item.type.startsWith("image/"),
    );
    if (file) setCropFile(file);
  }

  async function applyCoverCrop(file: File) {
    const fileID = await uploadAsset(file);
    const localUrl = URL.createObjectURL(file);
    setAssetPreviews((current) => ({ ...current, [fileID]: localUrl }));
    setCover(localUrl);
    setCoverFileID(fileID);
    setCropFile(null);
    notify("封面图已更新");
  }

  async function uploadGalleryFiles(selectedFiles: File[]) {
    const files = selectedFiles
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, 30 - images.length));
    if (!files.length) return;
    const pending = files.map((file) => ({
      file,
      localUrl: URL.createObjectURL(file),
    }));
    setImages((current) =>
      [...current, ...pending.map((item) => item.localUrl)].slice(0, 30),
    );
    setImageFileIDs((current) =>
      [...current, ...pending.map((item) => item.localUrl)].slice(0, 30),
    );
    setImageNames((current) =>
      [...current, ...pending.map(() => "")].slice(0, 30),
    );
    setUploadingImages((current) => [
      ...current,
      ...pending.map((item) => item.localUrl),
    ]);
    notify(`正在上传 ${pending.length} 张案例图片`);
    let succeeded = 0;
    await Promise.all(
      pending.map(async ({ file, localUrl }) => {
        try {
          const remoteUrl = await uploadAsset(file);
          setAssetPreviews((current) => ({
            ...current,
            [remoteUrl]: localUrl,
          }));
          setImageFileIDs((current) =>
            current.map((url) => (url === localUrl ? remoteUrl : url)),
          );
          succeeded += 1;
        } catch (error) {
          console.error("gallery upload failed", error);
          setImages((current) => current.filter((url) => url !== localUrl));
          setImageFileIDs((current) =>
            current.filter((url) => url !== localUrl),
          );
        } finally {
          setUploadingImages((current) =>
            current.filter((url) => url !== localUrl),
          );
        }
      }),
    );
    notify(
      succeeded === pending.length
        ? `已上传 ${succeeded} 张案例图片`
        : `${succeeded} 张上传成功，${pending.length - succeeded} 张失败`,
    );
  }

  async function handleGalleryFiles(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    await uploadGalleryFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  function moveImage(from: number, to: number) {
    if (from === to) return;
    setImages((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setImageFileIDs((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setImageNames((current) => {
      const next = Array.from(
        { length: images.length },
        (_, index) => current[index] || "",
      );
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function finishImageSort() {
    draggedImageIndexRef.current = null;
    setDraggedImageIndex(null);
  }

  useEffect(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".image-management .gallery-image-card",
      ),
    );
    const cleanups = cards.map((card, index) => {
      const start = (event: DragEvent) => {
        if (
          (event.target as HTMLElement)?.closest("input, button.remove-image")
        ) {
          event.preventDefault();
          return;
        }
        draggedImageIndexRef.current = index;
        setDraggedImageIndex(index);
        card.classList.add("is-sorting");
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      };
      const over = (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        cards.forEach((item) => item.classList.remove("is-drop-target"));
        card.classList.add("is-drop-target");
        const from = draggedImageIndexRef.current;
        if (from === null || from === index) return;
        const rect = card.getBoundingClientRect();
        const crossed =
          from < index
            ? event.clientX > rect.left + rect.width * 0.38
            : event.clientX < rect.right - rect.width * 0.38;
        if (!crossed) return;
        moveImage(from, index);
        draggedImageIndexRef.current = index;
        setDraggedImageIndex(index);
      };
      const end = () => {
        cards.forEach((item) =>
          item.classList.remove("is-sorting", "is-drop-target"),
        );
        finishImageSort();
      };
      card.addEventListener("dragstart", start, true);
      card.addEventListener("dragover", over, true);
      card.addEventListener("drop", end, true);
      card.addEventListener("dragend", end, true);
      return () => {
        card.removeEventListener("dragstart", start, true);
        card.removeEventListener("dragover", over, true);
        card.removeEventListener("drop", end, true);
        card.removeEventListener("dragend", end, true);
      };
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [images]);

  // --- Image Section Operations ---

  function addSection(focusName = false) {
    setImageSections((current) => [
      ...current,
      { name: "", images: [], imageFileIDs: [] },
    ]);
    if (focusName) {
      window.requestAnimationFrame(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>(
          ".section-name-input",
        );
        inputs[inputs.length - 1]?.focus();
      });
    }
  }

  function removeSection(index: number) {
    setImageSections((current) => current.filter((_, i) => i !== index));
  }

  function moveSection(from: number, to: number) {
    if (from === to || to < 0 || to >= imageSections.length) return;
    setImageSections((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function updateSectionName(index: number, name: string) {
    setImageSections((current) =>
      current.map((section, i) =>
        i === index ? { ...section, name } : section,
      ),
    );
  }

  function addSectionFileInput() {
    const sectionIndex = activeSectionIndex;
    if (sectionIndex === null) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = (event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length) void uploadToSection(sectionIndex, files);
    };
    input.click();
  }

  async function uploadToSection(sectionIndex: number, files: File[]) {
    const currentTotal = imageSections.reduce(
      (sum, section) => sum + section.images.length,
      0,
    );
    const available = Math.max(0, 30 - currentTotal);
    const imageFiles = files
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, available);
    if (!available) {
      notify("每个案例最多上传30张图片");
      return;
    }
    if (!imageFiles.length) return;
    const pending = imageFiles.map((file) => ({
      file,
      localUrl: URL.createObjectURL(file),
    }));
    setImageSections((current) =>
      current.map((section, i) => {
        if (i !== sectionIndex) return section;
        return {
          ...section,
          images: [...section.images, ...pending.map((p) => p.localUrl)],
          imageFileIDs: [
            ...section.imageFileIDs,
            ...pending.map((p) => p.localUrl),
          ],
        };
      }),
    );
    setSectionUploading((current) => ({
      ...current,
      [sectionIndex]: pending.map((p) => p.localUrl),
    }));
    notify(`正在上传 ${pending.length} 张图片`);
    let succeeded = 0;
    await Promise.all(
      pending.map(async ({ file, localUrl }) => {
        try {
          const remoteUrl = await uploadAsset(file);
          setAssetPreviews((current) => ({
            ...current,
            [remoteUrl]: localUrl,
          }));
          setImageSections((current) =>
            current.map((section, i) => {
              if (i !== sectionIndex) return section;
              return {
                ...section,
                imageFileIDs: section.imageFileIDs.map((url) =>
                  url === localUrl ? remoteUrl : url,
                ),
              };
            }),
          );
          succeeded++;
        } catch (error) {
          console.error("section upload failed", error);
          setImageSections((current) =>
            current.map((section, i) => {
              if (i !== sectionIndex) return section;
              return {
                ...section,
                images: section.images.filter((url) => url !== localUrl),
                imageFileIDs: section.imageFileIDs.filter(
                  (url) => url !== localUrl,
                ),
              };
            }),
          );
        } finally {
          setSectionUploading((current) => {
            const next = { ...current };
            next[sectionIndex] = (next[sectionIndex] || []).filter(
              (url) => url !== localUrl,
            );
            if (!next[sectionIndex].length) delete next[sectionIndex];
            return next;
          });
        }
      }),
    );
    notify(
      succeeded === pending.length
        ? `已上传 ${succeeded} 张图片`
        : `${succeeded} 张上传成功`,
    );
  }

  function removeSectionImage(sectionIndex: number, imageIndex: number) {
    setImageSections((current) =>
      current.map((section, i) => {
        if (i !== sectionIndex) return section;
        return {
          ...section,
          images: section.images.filter((_, j) => j !== imageIndex),
          imageFileIDs: section.imageFileIDs.filter((_, j) => j !== imageIndex),
        };
      }),
    );
  }

  function moveSectionImage(
    fromSection: number,
    fromImage: number,
    toSection: number,
    toImage: number,
  ) {
    if (fromSection === toSection && fromImage === toImage) return;
    setImageSections((current) => {
      const next = current.map((section) => ({
        ...section,
        images: [...section.images],
        imageFileIDs: [...section.imageFileIDs],
      }));
      const source = next[fromSection];
      const target = next[toSection];
      if (!source || !target || !source.images[fromImage]) return current;
      const [movedImage] = source.images.splice(fromImage, 1);
      const [movedFileID] = source.imageFileIDs.splice(fromImage, 1);
      const insertAt = toImage;
      target.images.splice(
        Math.min(insertAt, target.images.length),
        0,
        movedImage,
      );
      target.imageFileIDs.splice(
        Math.min(insertAt, target.imageFileIDs.length),
        0,
        movedFileID,
      );
      return next;
    });
  }

  const isUploadingAny = Object.values(sectionUploading).some(
    (arr) => arr.length > 0,
  );
  const totalSectionImages = imageSections.reduce(
    (sum, section) => sum + section.images.length,
    0,
  );

  async function submit(nextStatus: CaseRecord["status"]) {
    if (savingRef.current) {
      notify("案例正在保存，请勿重复点击");
      return;
    }
    if (uploadingImages.length || isUploadingAny) {
      notify("还有图片正在上传，请稍候");
      return;
    }
    if (!name.trim() || !community.trim() || !area) {
      notify("请先填写案例名称、小区和面积");
      return;
    }
    if (nextStatus === "已上架" && !cover) {
      notify("请先上传案例封面");
      return;
    }
    addCommunity(community);
    addStyle(style);
    savingRef.current = true;
    try {
      const cleanSections = imageSections
        .map((section) => ({
          name: section.name.trim(),
          images: section.imageFileIDs.filter(Boolean),
        }))
        .filter((section) => section.name && section.images.length);
      const unnamedWithImages = imageSections.some(
        (section) => !section.name.trim() && section.images.length,
      );
      if (unnamedWithImages) {
        notify("请填写所有图片分区的名称");
        savingRef.current = false;
        return;
      }
      await Promise.all(
        Array.from(
          new Set(cleanSections.map((section) => section.name).filter(Boolean)),
        ).map((sectionName) => addSpace(sectionName)),
      );
      const allSectionImages = imageSections.flatMap(
        (section) => section.images,
      );
      const allSectionFileIDs = imageSections.flatMap(
        (section) => section.imageFileIDs,
      );
      await save({
        _id: item?._id,
        id: item?.id || `A${Date.now()}`,
        name,
        community,
        area: Number(area),
        layout: `${rooms}室${halls}厅`,
        style,
        status: nextStatus,
        views: item?.views || 0,
        favorites: item?.favorites || 0,
        shares: item?.shares || 0,
        cover,
        coverFileID,
        featured: item?.featured || false,
        recommended: item?.recommended || false,
        hot: item?.hot || false,
        homeHero: item?.homeHero || false,
        images: allSectionImages,
        imageFileIDs: allSectionFileIDs,
        imageNames: allSectionImages.map(() => ""),
        imageSections: cleanSections,
        description,
        layoutInfo,
        highlights,
        tags: selectedTags,
        uploader: item?.uploader || currentUsername,
        updatedAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      });
    } finally {
      savingRef.current = false;
    }
  }

  const editorValue =
    contentTab === "案例说明"
      ? description
      : contentTab === "户型信息"
        ? layoutInfo
        : highlights;
  const setEditorValue =
    contentTab === "案例说明"
      ? setDescription
      : contentTab === "户型信息"
        ? setLayoutInfo
        : setHighlights;
  return (
    <section className="page-section case-edit-page edit-form">
      <div className="edit-page-head">
        <button className="back-button" onClick={back}>
          <ChevronLeft size={17} />
          {item ? "返回案例详情" : "返回案例列表"}
        </button>
      </div>
      <div className="case-edit-stack">
        <section className="edit-surface">
          <header>
            <h3>基础资料</h3>
            <p>用于案例列表、筛选和详情页展示</p>
          </header>
          <div className="case-basic-grid">
            <label className="required">
              <span>案例名称</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="请输入案例名称"
              />
            </label>
            <label className="required">
              <span>所属小区</span>
              <button
                type="button"
                className="community-trigger"
                onClick={() => setCommunityOpen(true)}
              >
                <span className={community ? "" : "placeholder"}>
                  {community || "请选择小区"}
                </span>
                <ChevronDown size={16} />
              </button>
            </label>
            <label className="required">
              <span>设计风格</span>
              <button
                type="button"
                className="community-trigger"
                onClick={() => setStyleOpen(true)}
              >
                <span className={style ? "" : "placeholder"}>
                  {style || "请选择设计风格"}
                </span>
                <ChevronDown size={16} />
              </button>
            </label>
            <label className="wide-field required">
              <span>户型 / 面积</span>
              <div className="layout-inputs">
                <div>
                  <input
                    value={area}
                    inputMode="decimal"
                    onChange={(event) => setArea(event.target.value)}
                  />
                  <i>㎡</i>
                </div>
                <div>
                  <input
                    value={rooms}
                    inputMode="numeric"
                    onChange={(event) => setRooms(event.target.value)}
                  />
                  <i>室</i>
                </div>
                <div>
                  <input
                    value={halls}
                    inputMode="numeric"
                    onChange={(event) => setHalls(event.target.value)}
                  />
                  <i>厅</i>
                </div>
                <div>
                  <input
                    value={baths}
                    inputMode="numeric"
                    onChange={(event) => setBaths(event.target.value)}
                  />
                  <i>卫</i>
                </div>
              </div>
            </label>
            <label className="wide-field">
              <span>案例状态</span>
              <div className="status-segment">
                {(["已上架", "草稿", "已下架"] as const).map((value) => (
                  <button
                    type="button"
                    className={status === value ? "active" : ""}
                    onClick={() => setStatus(value)}
                    key={value}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </label>
          </div>
        </section>
        <section className="edit-surface">
          <header>
            <h3>案例内容</h3>
            <p>分别编辑详情页的三个内容模块</p>
          </header>
          <div className="content-edit-tabs">
            {["案例说明", "户型信息", "设计亮点"].map((sectionName) => (
              <button
                type="button"
                className={contentTab === sectionName ? "active" : ""}
                onClick={() => setContentTab(sectionName)}
                key={sectionName}
              >
                {sectionName}
              </button>
            ))}
          </div>
          <RichEditor value={editorValue} onChange={setEditorValue} />
          <div className="case-keyword-editor">
            <div>
              <strong>案例关键词</strong>
              <span>自己输入，回车后自动生成标签</span>
            </div>
            <KeywordInput value={selectedTags} onChange={setSelectedTags} />
          </div>
        </section>
        <section className="edit-surface image-management">
          <header>
            <h3>图片管理</h3>
          </header>
          <div className="image-management-grid">
            <div>
              <h4>
                案例封面 <small>16:9，建议 1600×900px；支持拖入</small>
              </h4>
              <div
                className={`cover-upload${cover ? "" : " empty"}${coverDragging ? " is-dragging" : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setCoverDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  )
                    setCoverDragging(false);
                }}
                onDrop={handleCoverDrop}
              >
                {cover ? (
                  <>
                    <button
                      className="cover-preview-button"
                      onClick={() => setCoverPreviewOpen(true)}
                    >
                      <img src={assetPreviews[cover] || cover} alt="" />
                    </button>
                    <button onClick={() => fileRef.current?.click()}>
                      <Upload size={15} />
                      重新上传
                    </button>
                  </>
                ) : (
                  <button
                    className="cover-empty"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Plus size={22} />
                    点击或拖入封面
                  </button>
                )}
                <input
                  ref={fileRef}
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                />
              </div>
            </div>
            <div>
              <h4>
                图片分区{" "}
                <small>
                  按空间分组，共 {totalSectionImages}/30 张；图片可拖到其他区域
                </small>
              </h4>
              <div className="section-list">
                {imageSections.map((section, si) => (
                  <div
                    className={`image-section-card${sectionDragging && activeSectionIndex === si ? " is-dragging" : ""}`}
                    key={si}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setSectionDragging(true);
                      setActiveSectionIndex(si);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node,
                        )
                      ) {
                        setSectionDragging(false);
                        setActiveSectionIndex(null);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setSectionDragging(false);
                      setActiveSectionIndex(null);
                      if (event.dataTransfer.files.length) {
                        void uploadToSection(
                          si,
                          Array.from(event.dataTransfer.files),
                        );
                      } else if (sectionDragItem) {
                        moveSectionImage(
                          sectionDragItem.section,
                          sectionDragItem.image,
                          si,
                          section.images.length,
                        );
                      }
                      setSectionDragItem(null);
                    }}
                  >
                    <div className="section-header">
                      <input
                        className="section-name-input"
                        list="case-space-options"
                        value={section.name}
                        maxLength={20}
                        onChange={(event) =>
                          updateSectionName(si, event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          event.stopPropagation();
                          addSection(true);
                        }}
                        placeholder="分区名称（如：客厅）"
                      />
                      <div className="section-order-actions">
                        <button
                          disabled={si === 0}
                          onClick={() => moveSection(si, si - 1)}
                          title="上移区域"
                        >
                          ↑
                        </button>
                        <button
                          disabled={si === imageSections.length - 1}
                          onClick={() => moveSection(si, si + 1)}
                          title="下移区域"
                        >
                          ↓
                        </button>
                      </div>
                      <button
                        className="remove-section-btn"
                        onClick={() => removeSection(si)}
                        title="删除分区"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="section-drop-zone">
                      <div className="section-image-grid">
                        {section.images.map((img, ii) => {
                          const flatIndex =
                            imageSections
                              .slice(0, si)
                              .reduce((sum, s) => sum + s.images.length, 0) +
                            ii;
                          return (
                            <div
                              className={`section-image-card${(sectionUploading[si] || []).includes(img) ? " is-uploading" : ""}`}
                              draggable={
                                !(sectionUploading[si] || []).includes(img)
                              }
                              key={`${img}-${ii}`}
                              onDragStart={() =>
                                setSectionDragItem({ section: si, image: ii })
                              }
                              onDragEnd={() => setSectionDragItem(null)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (sectionDragItem)
                                  moveSectionImage(
                                    sectionDragItem.section,
                                    sectionDragItem.image,
                                    si,
                                    ii,
                                  );
                                setSectionDragItem(null);
                              }}
                            >
                              <div className="section-image-frame">
                                <button
                                  className="thumbnail-preview"
                                  onClick={() => setLightboxIndex(flatIndex)}
                                >
                                  <img
                                    src={assetPreviews[img] || img}
                                    alt={section.name}
                                  />
                                </button>
                                {(sectionUploading[si] || []).includes(img) && (
                                  <span className="image-uploading">
                                    上传中…
                                  </span>
                                )}
                                <button
                                  className="remove-image"
                                  onClick={() =>
                                    setSectionDeleteIndex({
                                      section: si,
                                      image: ii,
                                    })
                                  }
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {totalSectionImages < 30 && (
                          <button
                            className="add-image"
                            onClick={() => {
                              setActiveSectionIndex(si);
                              addSectionFileInput();
                            }}
                          >
                            <Plus size={22} />
                            上传图片
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  className="add-section-btn"
                  onClick={() => addSection(true)}
                >
                  <Plus size={18} />
                  添加分区
                </button>
                <datalist id="case-space-options">
                  {spaces.map((space) => (
                    <option key={space} value={space} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className="sticky-actions">
        <button className="line-button" onClick={back}>
          取消
        </button>
        <button className="line-button" onClick={() => submit("草稿")}>
          <Save size={15} />
          保存草稿
        </button>
        <button
          data-enter-submit
          className="gold-button"
          onClick={() => submit("已上架")}
        >
          保存并上架
        </button>
      </div>
      {communityOpen && (
        <CommunityPicker
          value={community}
          options={communities}
          close={() => setCommunityOpen(false)}
          select={(value) => {
            setCommunity(value);
            addCommunity(value);
            setCommunityOpen(false);
          }}
        />
      )}
      {styleOpen && (
        <CommunityPicker
          value={style}
          options={styles}
          title="选择设计风格"
          description="选择已有风格，或添加一个新的设计风格"
          searchPlaceholder="搜索设计风格"
          customPlaceholder="输入自定义风格"
          close={() => setStyleOpen(false)}
          select={(value) => {
            setStyle(value);
            addStyle(value);
            setStyleOpen(false);
          }}
        />
      )}
      {cropFile && (
        <CoverCropper
          file={cropFile}
          close={() => setCropFile(null)}
          confirm={(file) => void applyCoverCrop(file)}
        />
      )}
      {coverPreviewOpen && cover && (
        <ImageLightbox
          images={[cover]}
          index={0}
          setIndex={() => undefined}
          close={() => setCoverPreviewOpen(false)}
        />
      )}
      {lightboxIndex !== null &&
        imageSections.flatMap((s) => s.images).length > 0 && (
          <ImageLightbox
            images={imageSections.flatMap((s) => s.images)}
            index={Math.min(
              lightboxIndex,
              imageSections.flatMap((s) => s.images).length - 1,
            )}
            setIndex={setLightboxIndex}
            close={() => setLightboxIndex(null)}
          />
        )}
      {sectionDeleteIndex !== null && (
        <ConfirmAction
          title="删除这张案例图片？"
          text="删除后需要重新上传才能恢复。"
          cancel={() => setSectionDeleteIndex(null)}
          confirm={() => {
            removeSectionImage(
              sectionDeleteIndex.section,
              sectionDeleteIndex.image,
            );
            setSectionDeleteIndex(null);
            notify("案例图片已删除");
          }}
        />
      )}
    </section>
  );
}

function Customers({
  customers,
  notify,
}: {
  customers: Customer[];
  notify: (message: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [community, setCommunity] = useState("");
  const [status, setStatus] = useState("全部");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const miniProgramCustomers = customers.filter(
    (item) => item.source === "小程序" || item.source === "微信小程序",
  );
  const filtered = miniProgramCustomers.filter(
    (item) =>
      `${item.phone}${item.name}`.includes(phone) &&
      item.community.includes(community) &&
      (status === "全部" || item.status === status),
  );

  return (
    <section className="page-section">
      <div className="filter-bar customer-filter">
        <label>
          <span>手机号 / 昵称</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="输入关键词"
          />
        </label>
        <label>
          <span>小区</span>
          <input
            value={community}
            onChange={(e) => setCommunity(e.target.value)}
            placeholder="输入关键词"
          />
        </label>
        <label>
          <span>状态</span>
          <SmartSelect
            value={status}
            options={["全部", "跟进中", "已签单", "已流失"]}
            onChange={setStatus}
          />
        </label>
        <button
          data-enter-submit
          className="search-button"
          onClick={() => notify(`已筛选出 ${filtered.length} 位客户`)}
        >
          <Search size={15} />
          查询
        </button>
        <button
          className="plain-button"
          onClick={() => {
            setPhone("");
            setCommunity("");
            setStatus("全部");
          }}
        >
          <RotateCcw size={14} />
          重置
        </button>
      </div>
      <div className="mobile-customer-list">
        {filtered.map((item) => (
          <article
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedCustomer(item)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setSelectedCustomer(item);
            }}
          >
            <header>
              <div>
                <strong>{item.name}</strong>
                <span>{item.phone}</span>
              </div>
              <Status value={item.status} />
            </header>
            <p>
              {item.community}　{item.area}
            </p>
            <footer>
              <time>{item.createdAt}</time>
              <span>
                查看咨询详情 <ChevronRight size={15} />
              </span>
            </footer>
          </article>
        ))}
      </div>
      <div className="data-table customer-table desktop-table">
        <table>
          <thead>
            <tr>
              <th>客户编号</th>
              <th>手机号</th>
              <th>微信昵称</th>
              <th>小区</th>
              <th>面积</th>
              <th>状态</th>
              <th>添加时间</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr
                key={item.id}
                className="customer-row"
                onClick={() => setSelectedCustomer(item)}
              >
                <td className="muted">{item.id}</td>
                <td>{item.phone}</td>
                <td>
                  <button
                    className="customer-link"
                    onClick={() => setSelectedCustomer(item)}
                  >
                    {item.name}
                  </button>
                </td>
                <td>{item.community}</td>
                <td>{item.area}</td>
                <td>
                  <Status value={item.status} />
                </td>
                <td>{item.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager total={filtered.length} />
      </div>
      {selectedCustomer && (
        <div className="dialog-layer">
          <button
            className="dialog-backdrop"
            onClick={() => setSelectedCustomer(null)}
          />
          <section className="customer-info-dialog consultation-detail-dialog">
            <header>
              <div>
                <h3>{selectedCustomer.name}</h3>
                <span>{selectedCustomer.id}</span>
              </div>
              <button onClick={() => setSelectedCustomer(null)}>
                <X size={19} />
              </button>
            </header>
            <dl>
              <div>
                <dt>手机号</dt>
                <dd>{selectedCustomer.phone}</dd>
              </div>
              <div>
                <dt>所在小区</dt>
                <dd>{selectedCustomer.community}</dd>
              </div>
              <div>
                <dt>建筑面积</dt>
                <dd>{selectedCustomer.area}</dd>
              </div>
              <div>
                <dt>装修状态</dt>
                <dd>{selectedCustomer.decorationStatus || "未填写"}</dd>
              </div>
              <div>
                <dt>来源案例</dt>
                <dd>{selectedCustomer.sourceCaseName || "无"}</dd>
              </div>
              <div className="consult-question">
                <dt>想咨询的问题</dt>
                <dd>{selectedCustomer.question || "未填写"}</dd>
              </div>
              <div>
                <dt>添加时间</dt>
                <dd>{selectedCustomer.createdAt}</dd>
              </div>
            </dl>
            <footer>
              <button
                className="gold-button"
                onClick={() => setSelectedCustomer(null)}
              >
                完成
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function Analytics({
  cases,
  customers,
  events,
  open,
}: {
  cases: CaseRecord[];
  customers: Customer[];
  events: AnalyticsEvent[];
  open: (view: View, item?: CaseRecord) => void;
}) {
  const [range, setRange] = useState("一个月");
  const [metric, setMetric] = useState<"浏览" | "收藏" | "分享">("浏览");
  const [activePoint, setActivePoint] = useState(8);
  const rangeOptions = ["7天", "一个月", "三个月", "180天", "365天", "全部"];
  const dayMap: Record<string, number> = {
    "7天": 7,
    一个月: 30,
    三个月: 90,
    "180天": 180,
    "365天": 365,
    全部: 730,
  };
  const axisLabels: Record<string, [string, string, string]> = {
    "7天": ["第1天", "第4天", "第7天"],
    一个月: ["月初", "月中", "月末"],
    三个月: ["第1月", "第2月", "第3月"],
    "180天": ["第1月", "第3月", "第6月"],
    "365天": ["第1月", "第6月", "第12月"],
    全部: ["最早", "中段", "至今"],
  };
  const now = Date.now();
  const eventTimestamp = (event: AnalyticsEvent) =>
    event.createdAt ? new Date(event.createdAt).getTime() : NaN;
  const recordedTimestamps = events.map(eventTimestamp).filter(Number.isFinite);
  const rangeStart =
    range === "全部"
      ? Math.min(...recordedTimestamps, now)
      : now - dayMap[range] * 86400000;
  const recentEvents = events.filter((event) => {
    const timestamp = eventTimestamp(event);
    return (
      Number.isFinite(timestamp) && timestamp >= rangeStart && timestamp <= now
    );
  });
  const eventCount = (type: AnalyticsEvent["type"]) =>
    recentEvents.filter((event) => event.type === type).length;
  const hasRealEvents = recentEvents.length > 0;
  const views = eventCount("case_view");
  const uniqueVisitors = new Set(
    recentEvents
      .filter((event) => event.type === "case_view" && event.openid)
      .map((event) => event.openid),
  ).size;
  const favorites = eventCount("favorite_add");
  const shares = eventCount("share");
  const consultations = eventCount("consultation");
  const conversion = views ? ((consultations / views) * 100).toFixed(1) : "0.0";
  const metricEventType: AnalyticsEvent["type"] =
    metric === "浏览"
      ? "case_view"
      : metric === "收藏"
        ? "favorite_add"
        : "share";
  const trend = Array.from({ length: 12 }, () => 0);
  const trendSpan = Math.max(now - rangeStart, 1);
  recentEvents
    .filter((event) => event.type === metricEventType)
    .forEach((event) => {
      const index = Math.min(
        11,
        Math.max(
          0,
          Math.floor(((eventTimestamp(event) - rangeStart) / trendSpan) * 12),
        ),
      );
      trend[index] += 1;
    });
  const maxTrend = Math.max(...trend, 1);
  const metricValue = (item: CaseRecord) =>
    recentEvents.filter(
      (event) => event.type === metricEventType && event.caseId === item.id,
    ).length;
  const ranked = [...cases].sort((a, b) => metricValue(b) - metricValue(a));
  const maxRank = Math.max(...ranked.map(metricValue), 1);
  const funnel = [
    { label: "案例浏览", value: views, color: "#1d1d1f" },
    { label: "产生收藏", value: favorites, color: "#5b7cfa" },
    { label: "主动分享", value: shares, color: "#48a58d" },
    { label: "提交咨询", value: consultations, color: "#d19b4d" },
  ];
  const kpis = [
    { label: "案例浏览量（PV）", value: views, icon: Eye },
    { label: "独立访客（UV）", value: uniqueVisitors, icon: Users },
    { label: "收藏量", value: favorites, icon: Heart },
    { label: "分享量", value: shares, icon: Share2 },
    { label: "咨询量", value: consultations, icon: Plus },
    { label: "浏览转咨询", value: `${conversion}%`, icon: TrendingUp },
  ];

  return (
    <section className="page-section analytics-page">
      <div className="analytics-toolbar">
        <div className="range-select">
          <span>统计范围</span>
          <SmartSelect
            value={range}
            options={rangeOptions}
            onChange={setRange}
          />
        </div>
      </div>
      <div className="metric-row">
        {kpis.map(({ label, value, icon: Icon }) => (
          <article key={label}>
            <div>
              <span>{label}</span>
              <i>
                <Icon size={18} />
              </i>
            </div>
            <strong>
              {typeof value === "number" ? value.toLocaleString() : value}
            </strong>
            <small>当前筛选范围</small>
          </article>
        ))}
      </div>
      <div className="analytics-main-grid">
        <section className="ios-panel trend-panel">
          <header>
            <div>
              <h3>{metric}趋势</h3>
              <p>按“{range}”范围展示，不是固定周期</p>
            </div>
            <div className="trend-actions">
              <div className="analytics-segment">
                {(["浏览", "收藏", "分享"] as const).map((item) => (
                  <button
                    key={item}
                    className={metric === item ? "active" : ""}
                    onClick={() => setMetric(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <strong>{trend[activePoint].toLocaleString()}</strong>
            </div>
          </header>
          <div className="interactive-chart">
            <div className="chart-grid-lines" />
            <div className="chart-columns">
              {trend.map((value, index) => (
                <button
                  key={index}
                  className={activePoint === index ? "active" : ""}
                  style={{
                    height: value
                      ? `${Math.max(12, (value / maxTrend) * 88)}%`
                      : "0%",
                  }}
                  onMouseEnter={() => setActivePoint(index)}
                  onFocus={() => setActivePoint(index)}
                  onClick={() => setActivePoint(index)}
                  aria-label={`第${index + 1}个周期 ${value}`}
                >
                  <span>{value}</span>
                </button>
              ))}
            </div>
            <div className="chart-axis">
              <span>{axisLabels[range][0]}</span>
              <span>{axisLabels[range][1]}</span>
              <span>{axisLabels[range][2]}</span>
            </div>
          </div>
        </section>
        <section className="ios-panel funnel-panel">
          <header>
            <h3>客户转化漏斗</h3>
            <p>从浏览案例到提交咨询</p>
          </header>
          <div className="funnel-list">
            {funnel.map((item, index) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <div>
                  <i
                    style={{
                      width: item.value
                        ? `${Math.max(8, (item.value / Math.max(views, 1)) * 100)}%`
                        : "0%",
                      background: item.color,
                    }}
                  />
                </div>
                <strong>{item.value.toLocaleString()}</strong>
                <small>
                  {index === 0
                    ? views
                      ? "100%"
                      : "0.0%"
                    : `${((item.value / Math.max(views, 1)) * 100).toFixed(1)}%`}
                </small>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="ios-panel ranking-panel">
        <header>
          <div>
            <h3>热门案例排行</h3>
            <p>按{metric}量排序，可用于调整精选与首页推荐</p>
          </div>
          <span>{hasRealEvents ? "真实云端数据" : "暂无真实互动数据"}</span>
        </header>
        <div className="ranking-list">
          {ranked.slice(0, 5).map((item, index) => (
            <button
              className="ranking-row"
              key={item.id}
              onClick={() => open("case-preview", item)}
            >
              <em>{index + 1}</em>
              <img src={item.cover} alt="" />
              <div>
                <strong>{item.name}</strong>
                <span>
                  {item.community} · {item.style}
                </span>
                <i>
                  <b
                    style={{ width: `${(metricValue(item) / maxRank) * 100}%` }}
                  />
                </i>
              </div>
              <strong>{metricValue(item).toLocaleString()}</strong>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function Notifications({
  events,
  cases,
  customers,
  open,
}: {
  events: AnalyticsEvent[];
  cases: CaseRecord[];
  customers: Customer[];
  open: (view: View, item?: CaseRecord) => void;
}) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const list = events.filter((event) =>
    ["case_view", "favorite_add", "consultation", "share"].includes(event.type),
  );
  const eventLabel = (type: AnalyticsEvent["type"]) =>
    type === "case_view"
      ? "浏览了案例"
      : type === "favorite_add"
        ? "收藏了案例"
        : type === "consultation"
          ? "咨询了案例"
          : "分享了案例";
  const eventIcon = (type: AnalyticsEvent["type"]) =>
    type === "case_view"
      ? Eye
      : type === "favorite_add"
        ? Heart
        : type === "consultation"
          ? Users
          : Share2;
  return (
    <section className="page-section notification-page">
      <div className="notification-summary">
        <strong>客户互动</strong>
        <span>{list.length} 条通知</span>
      </div>
      <div className={`notification-list ${list.length ? "" : "is-empty"}`}>
        {list.length === 0 && (
          <div className="notification-empty">
            <Bell size={24} />
            <strong>暂无客户互动</strong>
            <span>客户收藏、分享案例或提交咨询后，通知会显示在这里。</span>
          </div>
        )}
        {list.map((event, index) => {
          const Icon = eventIcon(event.type);
          const target = cases.find((item) => item.id === event.caseId);
          const customer = customers.find(
            (item) => item.openid && item.openid === event.openid,
          );
          return (
            <div
              className="notification-item"
              key={event._id || `${event.type}-${index}`}
            >
              <button
                className="notification-main"
                onClick={() => target && open("case-preview", target)}
              >
                <i>
                  <Icon size={19} />
                </i>
                <div>
                  <p>
                    <strong>
                      {customer?.name || event.nickname || "匿名访客"}
                    </strong>{" "}
                    {eventLabel(event.type)}{" "}
                    <b>{event.caseName || target?.name || "未命名案例"}</b>
                  </p>
                  <span>
                    {typeof event.createdAt === "string"
                      ? event.createdAt.replace("T", " ").slice(0, 16)
                      : "刚刚"}
                  </span>
                </div>
                <ChevronRight size={18} />
              </button>
              <div className="notification-customer">
                <span>
                  {customer?.phone ||
                    event.phone ||
                    (event.nickname
                      ? `访客编号 ${event.visitorId?.slice(-8) || "-"}`
                      : "未完善个人信息")}
                </span>
                <b>
                  {customer?.community ||
                    event.community ||
                    (event.nickname ? "尚未提交咨询" : "匿名浏览")}
                </b>
                {customer && (
                  <button onClick={() => setSelectedCustomer(customer)}>
                    查看客户
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {selectedCustomer && (
        <div className="dialog-layer">
          <button
            className="dialog-backdrop"
            onClick={() => setSelectedCustomer(null)}
          />
          <section className="customer-info-dialog consultation-detail-dialog">
            <header>
              <div>
                <h3>{selectedCustomer.name}</h3>
                <span>{selectedCustomer.id}</span>
              </div>
              <button onClick={() => setSelectedCustomer(null)}>
                <X size={19} />
              </button>
            </header>
            <dl>
              <div>
                <dt>手机号</dt>
                <dd>{selectedCustomer.phone}</dd>
              </div>
              <div>
                <dt>所在小区</dt>
                <dd>{selectedCustomer.community}</dd>
              </div>
              <div>
                <dt>建筑面积</dt>
                <dd>{selectedCustomer.area}</dd>
              </div>
              <div>
                <dt>装修状态</dt>
                <dd>{selectedCustomer.decorationStatus || "未填写"}</dd>
              </div>
              <div>
                <dt>来源案例</dt>
                <dd>{selectedCustomer.sourceCaseName || "无"}</dd>
              </div>
              <div className="consult-question">
                <dt>想咨询的问题</dt>
                <dd>{selectedCustomer.question || "未填写"}</dd>
              </div>
              <div>
                <dt>添加时间</dt>
                <dd>{selectedCustomer.createdAt}</dd>
              </div>
            </dl>
            <footer>
              <button
                className="gold-button"
                onClick={() => setSelectedCustomer(null)}
              >
                完成
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function TagsView({
  session,
  notify,
  communities,
  styles,
  spaces,
  updateCommunities,
  updateStyles,
  updateSpaces,
}: {
  session: AdminSession;
  notify: (message: string) => void;
  communities: string[];
  styles: string[];
  spaces: string[];
  updateCommunities: (values: string[]) => void;
  updateStyles: (values: string[]) => void;
  updateSpaces: (values: string[]) => void;
}) {
  const defaultGroups: Record<string, string[]> = {
    风格: styles.length ? styles : DEFAULT_STYLES,
    户型: ["2室2厅", "3室2厅", "4室2厅", "复式", "别墅"],
    空间: spaces.length ? spaces : DEFAULT_SPACES,
    面积: ["80㎡以下", "80-100㎡", "100-120㎡", "120-150㎡", "150㎡以上"],
    小区: communities,
  };
  const [groups, setGroups] = useState<Record<string, string[]>>(defaultGroups);
  const [groupIds, setGroupIds] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<{ group: string; old: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<{
    group: string;
    value: string;
  } | null>(null);

  useEffect(() => {
    setGroups((current) => ({
      ...current,
      小区: communities,
      风格: styles,
      空间: spaces,
    }));
  }, [communities, styles, spaces]);

  useEffect(() => {
    if (session.mode !== "cloud") return;
    adminApi
      .listTags(session.token)
      .then((records: any[]) => {
        const next = { ...defaultGroups, 小区: [...communities] };
        const ids: Record<string, string> = {};
        records.forEach((record) => {
          const group = String(record.group || record.category || "");
          if (!Object.prototype.hasOwnProperty.call(next, group)) return;
          if (Array.isArray(record.values)) {
            next[group] = Array.from(
              new Set(record.values.map(String).filter(Boolean)),
            );
            if (record._id) ids[group] = record._id;
          }
        });
        records.forEach((record) => {
          const group = String(record.group || record.category || "");
          if (!Object.prototype.hasOwnProperty.call(next, group) || ids[group])
            return;
          const value = String(record.value || record.name || "").trim();
          if (value) next[group] = Array.from(new Set([...next[group], value]));
        });
        setGroups(next);
        setGroupIds(ids);
        updateCommunities(next.小区);
        updateStyles(next.风格);
        updateSpaces(next.空间);
      })
      .catch(() => notify("标签数据暂时无法加载"));
  }, [session.token]);

  async function persistGroup(group: string, values: string[]) {
    if (session.mode !== "cloud") return;
    const result = await adminApi.saveTag(
      session.token,
      { group, values },
      groupIds[group],
    );
    if (!groupIds[group])
      setGroupIds((current) => ({ ...current, [group]: result.id }));
  }

  async function saveTag(value: string) {
    if (!editor) return;
    const clean = value.trim();
    if (!clean) {
      notify("请输入标签名称");
      return;
    }
    const currentValues = groups[editor.group];
    if (clean !== editor.old && currentValues.includes(clean)) {
      notify("该标签已经存在");
      return;
    }
    const nextValues = editor.old
      ? currentValues.map((item) => (item === editor.old ? clean : item))
      : [...currentValues, clean];
    try {
      await persistGroup(editor.group, nextValues);
    } catch {
      notify("标签保存失败，请稍后重试");
      return;
    }
    setGroups((current) => ({ ...current, [editor.group]: nextValues }));
    if (editor.group === "小区") updateCommunities(nextValues);
    if (editor.group === "风格") updateStyles(nextValues);
    if (editor.group === "空间") updateSpaces(nextValues);
    notify(editor.old ? "标签已修改" : "标签已添加");
    setEditor(null);
  }

  async function deleteTag() {
    if (!deleting) return;
    const nextValues = groups[deleting.group].filter(
      (item) => item !== deleting.value,
    );
    try {
      await persistGroup(deleting.group, nextValues);
    } catch {
      notify("标签删除失败，请稍后重试");
      return;
    }
    setGroups((current) => ({ ...current, [deleting.group]: nextValues }));
    if (deleting.group === "小区") updateCommunities(nextValues);
    if (deleting.group === "风格") updateStyles(nextValues);
    if (deleting.group === "空间") updateSpaces(nextValues);
    setDeleting(null);
    notify("标签已删除");
  }

  return (
    <section className="page-section">
      <div className="tag-panels">
        {Object.entries(groups).map(([group, list]) => (
          <article key={group}>
            <div>
              <h3>{group}标签</h3>
              <button onClick={() => setEditor({ group, old: "" })}>
                <Plus size={14} />
                新增标签
              </button>
            </div>
            <ul>
              {list.map((item, index) => (
                <li key={item}>
                  <span>{item}</span>
                  <small>{index + 1}</small>
                  <div>
                    <button
                      title="编辑"
                      onClick={() => setEditor({ group, old: item })}
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      title="删除"
                      onClick={() => setDeleting({ group, value: item })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {editor && (
        <TextInputDialog
          title={editor.old ? "编辑标签" : `新增${editor.group}标签`}
          label={editor.group === "小区" ? "小区名称" : "标签名称"}
          value={editor.old}
          close={() => setEditor(null)}
          confirm={(value) => void saveTag(value)}
        />
      )}
      {deleting && (
        <ConfirmAction
          title={`删除“${deleting.value}”？`}
          text="删除后，新建案例时将无法再选择该标签。"
          cancel={() => setDeleting(null)}
          confirm={() => void deleteTag()}
        />
      )}
    </section>
  );
}

type AdminRecord = {
  _id?: string;
  originalAccount?: string;
  account: string;
  name: string;
  phone: string;
  role: "超级管理员" | "管理员";
  createdAt: string;
  status: string;
};

function Admins({
  session,
  notify,
  forceLogout,
}: {
  session: AdminSession;
  notify: (message: string) => void;
  forceLogout: () => void;
}) {
  const [list, setList] = useState<AdminRecord[]>([
    {
      account: "PN000",
      name: "测试管理员",
      phone: "13800000000",
      role: "超级管理员",
      createdAt: "2026-04-01",
      status: "正常",
    },
    {
      account: "editor01",
      name: "张三",
      phone: "13911111111",
      role: "管理员",
      createdAt: "2026-04-05",
      status: "正常",
    },
  ]);
  const [editing, setEditing] = useState<AdminRecord | null>(null);
  const [editorError, setEditorError] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<string | null>(null);
  const [resetAccount, setResetAccount] = useState<string | null>(null);

  useEffect(() => {
    if (session.mode !== "cloud" || session.admin.role !== "超级管理员") return;
    adminApi
      .listAdmins(session.token)
      .then((records) => setList(records as AdminRecord[]))
      .catch(() => notify("管理员数据暂时无法加载"));
  }, [session.token]);

  function openNew() {
    setIsNew(true);
    setEditorError("");
    setEditing({
      account: "",
      name: "",
      phone: "",
      role: "管理员",
      createdAt: new Date().toISOString().slice(0, 10),
      status: "正常",
    });
  }

  async function saveAdmin() {
    if (!editing?.account.trim()) {
      setEditorError("请填写管理员账号");
      return;
    }
    if (!editing.name.trim()) {
      setEditorError("请填写管理员姓名");
      return;
    }
    if (!/^1\d{10}$/.test(editing.phone)) {
      setEditorError("手机号必须是以 1 开头的11位号码");
      return;
    }
    if (isNew && list.some((item) => item.account === editing.account)) {
      setEditorError("管理员账号已存在，请更换账号");
      return;
    }
    const previous = list.find((item) =>
      item._id
        ? item._id === editing._id
        : item.account === (editing.originalAccount || editing.account),
    );
    setEditorError("");
    setSavingAdmin(true);
    try {
      if (session.mode === "cloud")
        await adminApi.saveAdmin(session.token, {
          id: editing._id,
          account: editing.account.trim(),
          name: editing.name.trim(),
          phone: editing.phone,
          role: editing.role,
        });
      const savedRecord = {
        ...editing,
        account: editing.account.trim(),
        name: editing.name.trim(),
        originalAccount: undefined,
      };
      setList((current) =>
        isNew
          ? [...current, savedRecord]
          : current.map((item) =>
              item._id
                ? item._id === editing._id
                  ? savedRecord
                  : item
                : item.account === previous?.account
                  ? savedRecord
                  : item,
            ),
      );
      setEditing(null);
      notify(isNew ? "管理员已添加，初始密码为 888888" : "管理员资料已更新");
      if (
        !isNew &&
        previous?.account === session.admin.username &&
        previous.account !== editing.account
      )
        forceLogout();
    } catch (error) {
      setEditorError(
        error instanceof Error ? error.message : "管理员保存失败，请稍后重试",
      );
    } finally {
      setSavingAdmin(false);
    }
  }

  async function toggle(record: AdminRecord) {
    if (record.account === session.admin.username && record.status === "正常") {
      notify("当前登录的超级管理员不能禁用自己");
      return;
    }
    const next = record.status === "正常" ? "停用" : "正常";
    if (session.mode === "cloud" && record._id)
      await adminApi.setAdminStatus(session.token, record._id, next);
    setList((current) =>
      current.map((item) =>
        item.account === record.account ? { ...item, status: next } : item,
      ),
    );
    notify("管理员状态已更新");
  }

  async function confirmReset() {
    const record = list.find((item) => item.account === resetAccount);
    if (!record) return;
    if (session.mode === "cloud" && record._id)
      await adminApi.resetAdminPassword(session.token, record._id);
    setResetAccount(null);
    notify("密码已重置为 888888，该账号已强制下线");
    if (record.account === session.admin.username) forceLogout();
  }

  async function confirmDelete() {
    const record = list.find((item) => item.account === deletingAccount);
    if (!record) return;
    if (session.mode === "cloud" && record._id)
      await adminApi.deleteAdmin(session.token, record._id);
    setList((current) =>
      current.filter((item) => item.account !== deletingAccount),
    );
    setDeletingAccount(null);
    notify("管理员已删除");
  }

  return (
    <section className="page-section">
      <div className="page-head">
        <div />
        <button className="gold-button" onClick={openNew}>
          <Plus size={15} />
          新增管理员
        </button>
      </div>
      <div className="mobile-admin-list">
        {list.map((item) => {
          const isSelf = item.account === session.admin.username;
          return (
            <article key={`mobile-${item._id || item.account}`}>
              <header>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.account}</span>
                </div>
                <Status value={item.status} />
              </header>
              <dl>
                <div>
                  <dt>角色</dt>
                  <dd>{item.role}</dd>
                </div>
                <div>
                  <dt>手机号</dt>
                  <dd>{item.phone}</dd>
                </div>
                <div>
                  <dt>添加时间</dt>
                  <dd>
                    {typeof item.createdAt === "string"
                      ? item.createdAt.slice(0, 10)
                      : "-"}
                  </dd>
                </div>
              </dl>
              <footer>
                <button
                  onClick={() => {
                    setIsNew(false);
                    setEditing({ ...item, originalAccount: item.account });
                  }}
                >
                  编辑
                </button>
                <button onClick={() => setResetAccount(item.account)}>
                  重置密码
                </button>
                <button
                  disabled={isSelf && item.status === "正常"}
                  onClick={() => void toggle(item)}
                >
                  {item.status === "正常" ? "禁用" : "启用"}
                </button>
                <button
                  disabled={isSelf}
                  className="danger"
                  onClick={() => setDeletingAccount(item.account)}
                >
                  删除
                </button>
              </footer>
            </article>
          );
        })}
      </div>
      <div className="data-table admin-table desktop-table">
        <table>
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>管理员账号</th>
              <th>姓名</th>
              <th>角色</th>
              <th>手机号</th>
              <th>添加时间</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((item) => {
              const isSelf = item.account === session.admin.username;
              return (
                <tr key={item._id || item.account}>
                  <td className="strong">{item.account}</td>
                  <td>{item.name}</td>
                  <td>
                    <span
                      className={`role-badge ${item.role === "超级管理员" ? "super" : ""}`}
                    >
                      {item.role}
                    </span>
                  </td>
                  <td>{item.phone}</td>
                  <td>
                    {typeof item.createdAt === "string"
                      ? item.createdAt.slice(0, 10)
                      : "-"}
                  </td>
                  <td>
                    <Status value={item.status} />
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        onClick={() => {
                          setIsNew(false);
                          setEditing({
                            ...item,
                            originalAccount: item.account,
                          });
                        }}
                      >
                        编辑
                      </button>
                      <button onClick={() => setResetAccount(item.account)}>
                        重置密码
                      </button>
                      <button
                        disabled={isSelf && item.status === "正常"}
                        title={isSelf ? "当前登录账号不能禁用自己" : ""}
                        onClick={() => void toggle(item)}
                      >
                        {item.status === "正常" ? "禁用" : "启用"}
                      </button>
                      <button
                        disabled={isSelf}
                        className="danger"
                        onClick={() => setDeletingAccount(item.account)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pager total={list.length} />
      </div>
      {editing && (
        <div className="dialog-layer">
          <button
            className="dialog-backdrop"
            onClick={() => setEditing(null)}
          />
          <form
            className="admin-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void saveAdmin();
            }}
          >
            <header>
              <div>
                <h3>{isNew ? "新增管理员" : "编辑管理员"}</h3>
                <p>
                  {isNew
                    ? "新账号初始密码为 888888"
                    : "修改账号后会强制该账号重新登录"}
                </p>
              </div>
              <button type="button" onClick={() => setEditing(null)}>
                <X size={20} />
              </button>
            </header>
            <div className="admin-editor-fields">
              <label>
                <span>管理员账号</span>
                <input
                  name="admin-account"
                  value={editing.account}
                  onChange={(e) => {
                    setEditorError("");
                    setEditing({ ...editing, account: e.target.value });
                  }}
                  autoFocus
                />
              </label>
              <label>
                <span>姓名</span>
                <input
                  name="admin-name"
                  value={editing.name}
                  onChange={(e) => {
                    setEditorError("");
                    setEditing({ ...editing, name: e.target.value });
                  }}
                />
              </label>
              <label>
                <span>角色</span>
                <SmartSelect
                  value={editing.role}
                  options={["超级管理员", "管理员"]}
                  onChange={(role) =>
                    setEditing({
                      ...editing,
                      role: role as AdminRecord["role"],
                    })
                  }
                />
              </label>
              <label>
                <span>手机号（11位）</span>
                <input
                  name="admin-phone"
                  value={editing.phone}
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="请输入11位手机号"
                  onChange={(e) => {
                    setEditorError("");
                    setEditing({
                      ...editing,
                      phone: e.target.value.replace(/\D/g, ""),
                    });
                  }}
                />
              </label>
            </div>
            {editorError && (
              <p className="admin-editor-error" role="alert">
                {editorError}
              </p>
            )}
            <footer>
              <button
                type="button"
                className="line-button"
                onClick={() => setEditing(null)}
              >
                取消
              </button>
              <button
                data-enter-submit
                className="gold-button"
                disabled={savingAdmin}
              >
                {savingAdmin ? "正在保存…" : "保存管理员"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {resetAccount && (
        <ConfirmAction
          title={`重置 ${resetAccount} 的密码？`}
          text="密码将重置为 888888，现有登录会话会立即失效。"
          cancel={() => setResetAccount(null)}
          confirm={() => void confirmReset()}
        />
      )}
      {deletingAccount && (
        <ConfirmAction
          title="删除该管理员？"
          text="删除后该账号将无法登录管理后台。"
          cancel={() => setDeletingAccount(null)}
          confirm={() => void confirmDelete()}
        />
      )}
    </section>
  );
}

const watermarkPositions = [
  { key: "top-left", label: "左上" },
  { key: "top-center", label: "上中" },
  { key: "top-right", label: "右上" },
  { key: "middle-left", label: "左中" },
  { key: "center", label: "居中" },
  { key: "middle-right", label: "右中" },
  { key: "bottom-left", label: "左下" },
  { key: "bottom-center", label: "下中" },
  { key: "bottom-right", label: "右下" },
];

function SystemSettings({ notify }: { notify: (message: string) => void }) {
  const [tab, setTab] = useState<SettingsTab>("水印设置");
  const [watermarkType, setWatermarkType] = useState<"image" | "text">("image");
  const [opacity, setOpacity] = useState(30);
  const [positions, setPositions] = useState(["bottom-right"]);
  const [watermarkText, setWatermarkText] = useState("品诺筑家整装");
  const [imageSize, setImageSize] = useState(28);
  const [imageAngle, setImageAngle] = useState(-15);
  const [textSize, setTextSize] = useState(24);
  const [textAngle, setTextAngle] = useState(-15);
  const [watermarkImage, setWatermarkImage] = useState(logoMark.src);
  const watermarkFileRef = useRef<HTMLInputElement>(null);
  const tabs: SettingsTab[] = ["水印设置", "品牌资料", "基础设置"];
  function togglePosition(key: string) {
    setPositions((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }
  function uploadWatermark(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/png") {
      notify("图片水印仅支持 PNG 格式");
      return;
    }
    setWatermarkImage(URL.createObjectURL(file));
    notify("图片水印已更新");
  }

  return (
    <section className="page-section">
      <div className="page-head">
        <div>
          <p>品牌、顾问与图片安全</p>
          <h1>系统设置</h1>
        </div>
      </div>
      <div className="settings-tabs">
        {tabs.map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === "水印设置" && (
        <div className="watermark-settings">
          <div className="watermark-demo">
            <h3>
              水印样式预览 <small>横屏 4:3</small>
            </h3>
            <div>
              <img src={photos[3]} alt="" />
              {positions.map((position) =>
                watermarkType === "image" ? (
                  <span
                    className={`wm-${position} image-watermark-preview`}
                    style={{
                      opacity: opacity / 100,
                      width: `${imageSize}%`,
                      transform: `translate(-50%, -50%) rotate(${imageAngle}deg)`,
                    }}
                    key={position}
                  >
                    <img src={watermarkImage} alt="" />
                  </span>
                ) : (
                  <span
                    className={`wm-${position} text-watermark-preview`}
                    style={{
                      opacity: opacity / 100,
                      fontSize: `${textSize}px`,
                      transform: `translate(-50%, -50%) rotate(${textAngle}deg)`,
                    }}
                    key={position}
                  >
                    {watermarkText}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="watermark-controls">
            <label>
              <span>水印类型</span>
              <div className="watermark-segment">
                <button
                  className={watermarkType === "image" ? "active" : ""}
                  onClick={() => setWatermarkType("image")}
                >
                  图片水印
                </button>
                <button
                  className={watermarkType === "text" ? "active" : ""}
                  onClick={() => setWatermarkType("text")}
                >
                  文字水印
                </button>
              </div>
            </label>
            {watermarkType === "image" ? (
              <>
                <label>
                  <span>PNG 图片</span>
                  <div>
                    <button
                      className="upload-file"
                      onClick={() => watermarkFileRef.current?.click()}
                    >
                      <Upload size={15} />
                      上传 PNG 水印
                    </button>
                    <input
                      ref={watermarkFileRef}
                      hidden
                      type="file"
                      accept="image/png"
                      onChange={uploadWatermark}
                    />
                  </div>
                  <small>仅支持透明背景 PNG</small>
                </label>
                <label className="range-setting">
                  <span>图片大小</span>
                  <input
                    type="range"
                    min="10"
                    max="50"
                    value={imageSize}
                    onChange={(e) => setImageSize(Number(e.target.value))}
                  />
                  <b>{imageSize}%</b>
                </label>
                <label className="range-setting">
                  <span>图片角度</span>
                  <input
                    type="range"
                    min="-45"
                    max="45"
                    value={imageAngle}
                    onChange={(e) => setImageAngle(Number(e.target.value))}
                  />
                  <b>{imageAngle}°</b>
                </label>
              </>
            ) : (
              <>
                <label>
                  <span>水印文字</span>
                  <input
                    className="setting-input"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder="请输入水印文字"
                  />
                </label>
                <label className="range-setting">
                  <span>文字大小</span>
                  <input
                    type="range"
                    min="12"
                    max="48"
                    value={textSize}
                    onChange={(e) => setTextSize(Number(e.target.value))}
                  />
                  <b>{textSize}px</b>
                </label>
                <label className="range-setting">
                  <span>文字角度</span>
                  <input
                    type="range"
                    min="-45"
                    max="45"
                    value={textAngle}
                    onChange={(e) => setTextAngle(Number(e.target.value))}
                  />
                  <b>{textAngle}°</b>
                </label>
              </>
            )}
            <label>
              <span>水印位置</span>
              <div className="position-grid">
                {watermarkPositions.map((position) => (
                  <button
                    title={position.label}
                    key={position.key}
                    className={positions.includes(position.key) ? "active" : ""}
                    onClick={() => togglePosition(position.key)}
                  >
                    {positions.includes(position.key) && <Check size={13} />}
                  </button>
                ))}
              </div>
              <small>支持多选，可同时覆盖多个位置</small>
            </label>
            <label className="range-setting">
              <span>透明度</span>
              <input
                type="range"
                min="10"
                max="70"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
              />
              <b>{opacity}%</b>
            </label>
            <div className="settings-save">
              <button
                className="line-button"
                onClick={() => {
                  setOpacity(30);
                  setPositions(["bottom-right"]);
                  setImageSize(28);
                  setImageAngle(-15);
                  setTextSize(24);
                  setTextAngle(-15);
                }}
              >
                <RotateCcw size={14} />
                重置
              </button>
              <button
                className="gold-button"
                onClick={() => notify("水印设置已保存")}
              >
                <Save size={15} />
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}
      {tab === "品牌资料" && (
        <SettingsForm
          title="品牌资料"
          fields={["公司名称", "品牌标语", "公司地址", "营业时间", "客服电话"]}
          values={[
            "品诺筑家整装",
            "良心做人，匠心做事",
            "甘肃省嘉峪关市河西建材城品诺筑家整装",
            "9:00-18:00",
            "",
          ]}
          notify={notify}
        />
      )}
      {tab === "基础设置" && (
        <SettingsForm
          title="小程序基础设置"
          fields={["首页主标题", "首页副标题", "咨询成功提示", "隐私政策版本"]}
          values={[
            "专注高品质整装设计",
            "用设计让家更美好",
            "设计师会尽快与您联系",
            "2026-07",
          ]}
          notify={notify}
        />
      )}
    </section>
  );
}

function SettingsForm({
  title,
  fields,
  values,
  notify,
}: {
  title: string;
  fields: string[];
  values: string[];
  notify: (message: string) => void;
}) {
  return (
    <div className="settings-form">
      <h3>{title}</h3>
      {fields.map((field, index) => (
        <label key={field}>
          <span>{field}</span>
          <input defaultValue={values[index]} placeholder={`请输入${field}`} />
        </label>
      ))}
      <div>
        <button
          className="gold-button"
          onClick={() => notify(`${title}已保存`)}
        >
          <Save size={15} />
          保存修改
        </button>
      </div>
    </div>
  );
}

function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="toast">
      <Check size={15} />
      {children}
    </div>
  );
}

export function AdminApp() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);
  const [view, setView] = useState<View>("cases");
  const [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null);
  const [caseReturnView, setCaseReturnView] = useState<View>("cases");
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [communities, setCommunities] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>(DEFAULT_STYLES);
  const [spaces, setSpaces] = useState<string[]>(DEFAULT_SPACES);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [passwordPromptDismissed, setPasswordPromptDismissed] = useState(false);
  const [toast, setToast] = useState("");
  const section = ["case-preview", "case-edit"].includes(view) ? "cases" : view;
  const pageTitle: Record<View, string> = {
    cases: "案例管理",
    "case-preview": "案例预览",
    "case-edit": selectedCase ? "编辑案例" : "新建案例",
    customers: "客户管理",
    analytics: "数据统计",
    notifications: "通知中心",
    tags: "标签管理",
    admins: "管理员管理",
    settings: "系统设置",
  };
  useEnterToNext();

  useEffect(() => {
    const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) {
      setRestoringSession(false);
      return;
    }
    try {
      const stored = JSON.parse(raw) as AdminSession;
      if (!stored.token || stored.mode !== "cloud")
        throw new Error("INVALID_STORED_SESSION");
      setSession(stored);
      setRestoringSession(false);
      adminApi
        .restoreSession(stored.token)
        .then((restored) => {
          setSession(restored);
          window.localStorage.setItem(
            ADMIN_SESSION_KEY,
            JSON.stringify(restored),
          );
        })
        .catch((error) => {
          if (error instanceof Error && error.message.includes("登录已过期")) {
            window.localStorage.removeItem(ADMIN_SESSION_KEY);
            setSession(null);
          }
        });
    } catch {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
      setRestoringSession(false);
    }
  }, []);

  function acceptSession(next: AdminSession) {
    setSession(next);
    if (next.mode === "cloud")
      window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(next));
  }

  function clearSession() {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    setSession(null);
  }

  useEffect(() => {
    if (!restoringSession && !session)
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
  }, [session, restoringSession]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function navigate(next: View, item?: CaseRecord) {
    if (
      session?.admin.role !== "超级管理员" &&
      ["admins", "settings"].includes(next)
    ) {
      notify("当前账号没有该页面权限");
      return;
    }
    if (
      ["case-preview", "case-edit"].includes(next) &&
      !["case-preview", "case-edit"].includes(view)
    ) {
      setCaseReturnView(view);
    } else if (!["case-preview", "case-edit"].includes(next)) {
      setCaseReturnView(next);
    }
    setSelectedCase(item || null);
    setView(next);
    setSidebarOpen(false);
  }

  async function saveCase(record: CaseRecord) {
    let saved = record;
    if (session?.mode === "cloud") {
      const { _id, ...data } = record;
      const result = await adminApi.saveCase(
        session.token,
        {
          ...data,
          cover: record.coverFileID || record.cover,
          images: record.imageFileIDs?.length
            ? record.imageFileIDs
            : record.images,
          imageSections: record.imageSections?.map((section) => ({
            name: section.name,
            images: section.imageFileIDs?.length
              ? section.imageFileIDs
              : section.images,
          })),
          coverFileID: undefined,
          imageFileIDs: undefined,
          caseNo: record.id,
        },
        _id,
      );
      saved = { ...record, _id: result.id };
    }
    setCases((current) =>
      current.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...current],
    );
    notify(saved.status === "已上架" ? "案例已保存并上架" : "案例草稿已保存");
    navigate("case-preview", saved);
  }

  async function persistCasePatch(
    record: CaseRecord,
    patch: Partial<CaseRecord>,
  ) {
    const next = { ...record, ...patch };
    if (session?.mode === "cloud") {
      const { _id, ...data } = next;
      await adminApi.saveCase(
        session.token,
        {
          ...data,
          cover: next.coverFileID || next.cover,
          images: next.imageFileIDs?.length ? next.imageFileIDs : next.images,
          imageSections: next.imageSections?.map((section) => ({
            name: section.name,
            images: section.imageFileIDs?.length
              ? section.imageFileIDs
              : section.images,
          })),
          coverFileID: undefined,
          imageFileIDs: undefined,
          caseNo: next.id,
        },
        _id,
      );
    }
    setCases((current) =>
      current.map((item) => {
        if (item.id === next.id) return next;
        if (patch.homeHero) return { ...item, homeHero: false };
        return item;
      }),
    );
  }

  async function deleteCase(id: string) {
    const target = cases.find((item) => item.id === id);
    if (session?.mode === "cloud" && target?._id) {
      await adminApi.deleteCase(session.token, target._id);
    }
    setCases((current) => current.filter((item) => item.id !== id));
    notify("案例已删除");
  }

  function uploadAsset(file: File) {
    if (session?.mode === "cloud") return adminApi.uploadAsset(file);
    return Promise.resolve(URL.createObjectURL(file));
  }

  function addCommunity(value: string) {
    const clean = value.trim();
    if (!clean) return;
    setCommunities((current) =>
      current.includes(clean) ? current : [...current, clean],
    );
  }

  function addStyle(value: string) {
    const clean = value.trim();
    if (!clean) return;
    setStyles((current) =>
      current.includes(clean) ? current : [...current, clean],
    );
  }

  async function addSpace(value: string) {
    const clean = value.trim();
    if (!clean || spaces.includes(clean)) return;
    const next = [...spaces, clean];
    if (session?.mode === "cloud") {
      const records = (await adminApi.listTags(session.token)) as any[];
      const record = records.find(
        (item) => String(item.group || item.category || "") === "空间",
      );
      const existing = Array.isArray(record?.values)
        ? record.values.map(String).filter(Boolean)
        : spaces;
      const values = Array.from(new Set([...existing, clean]));
      await adminApi.saveTag(
        session.token,
        { group: "空间", values },
        record?._id,
      );
      setSpaces(values);
      return;
    }
    setSpaces(next);
  }

  useEffect(() => {
    if (!session || session.mode !== "cloud") return;
    adminApi
      .listCases(session.token)
      .then(async (records) => {
        const mappedCases = records.map((record: any) => ({
          _id: record._id,
          id: record.caseNo || record._id,
          name: record.name || record.title || "未命名案例",
          community: record.community || "-",
          area: Number(record.area) || 0,
          layout: record.layout || "-",
          style: record.style || "-",
          status: record.status || "草稿",
          views: Number(record.views) || 0,
          favorites: Number(record.favorites) || 0,
          shares: Number(record.shares) || 0,
          cover: record.cover || record.coverUrl || photos[0],
          coverFileID:
            record.coverFileID || record.cover || record.coverUrl || "",
          featured: Boolean(record.featured),
          recommended: Boolean(record.recommended),
          hot: Boolean(record.hot),
          homeHero: Boolean(record.homeHero),
          images:
            Array.isArray(record.images) && record.images.length
              ? record.images
              : [record.cover || record.coverUrl || photos[0]],
          imageFileIDs:
            Array.isArray(record.imageFileIDs) && record.imageFileIDs.length
              ? record.imageFileIDs
              : Array.isArray(record.images)
                ? record.images
                : [],
          imageNames: Array.isArray(record.imageNames) ? record.imageNames : [],
          imageSections: Array.isArray(record.imageSections)
            ? record.imageSections
                .map((section: any) => ({
                  name: String(section.name || "").trim(),
                  images: Array.isArray(section.images)
                    ? section.images.map(String).filter(Boolean)
                    : [],
                  imageFileIDs: Array.isArray(section.imageFileIDs)
                    ? section.imageFileIDs.map(String).filter(Boolean)
                    : Array.isArray(section.images)
                      ? section.images.map(String).filter(Boolean)
                      : [],
                }))
                .filter((section: any) => section.name && section.images.length)
            : [],
          description: record.description || "",
          layoutInfo: record.layoutInfo || "",
          highlights: record.highlights || "",
          tags: Array.isArray(record.tags)
            ? record.tags.map(String).filter(Boolean)
            : [],
          uploader:
            record.uploader || record.createdBy || record.updatedBy || "-",
          updatedAt:
            typeof record.updatedAt === "string"
              ? record.updatedAt.replace("T", " ").slice(0, 16)
              : "-",
        }));
        setCases(mappedCases);
        const caseCommunities = Array.from(
          new Set(mappedCases.map((item) => item.community).filter(Boolean)),
        );
        const caseStyles = Array.from(
          new Set([
            ...DEFAULT_STYLES,
            ...mappedCases.map((item) => item.style).filter(Boolean),
          ]),
        );
        try {
          const tagRecords = (await adminApi.listTags(session.token)) as any[];
          const communityGroup = tagRecords.find(
            (record) =>
              String(record.group || record.category || "") === "小区" &&
              Array.isArray(record.values),
          );
          const styleGroup = tagRecords.find(
            (record) =>
              String(record.group || record.category || "") === "风格" &&
              Array.isArray(record.values),
          );
          const spaceGroup = tagRecords.find(
            (record) =>
              String(record.group || record.category || "") === "空间" &&
              Array.isArray(record.values),
          );
          setCommunities(
            communityGroup
              ? Array.from(
                  new Set(communityGroup.values.map(String).filter(Boolean)),
                )
              : caseCommunities,
          );
          setStyles(
            styleGroup
              ? Array.from(
                  new Set([
                    ...styleGroup.values.map(String).filter(Boolean),
                    ...caseStyles,
                  ]),
                )
              : caseStyles,
          );
          setSpaces(
            spaceGroup
              ? Array.from(
                  new Set(spaceGroup.values.map(String).filter(Boolean)),
                )
              : DEFAULT_SPACES,
          );
        } catch {
          setCommunities(caseCommunities);
          setStyles(caseStyles);
          setSpaces(DEFAULT_SPACES);
        }
      })
      .catch(() => notify("案例数据暂时无法加载"));
    adminApi
      .listLeads(session.token)
      .then((records) => {
        setCustomers(records.map(mapLeadToCustomer));
      })
      .catch(() => notify("ERP 客户数据暂时无法加载"));
    adminApi
      .getAnalytics(session.token)
      .then((records) => setAnalyticsEvents(records as AnalyticsEvent[]))
      .catch(() => notify("互动统计数据暂时无法加载"));
  }, [session]);

  useEffect(() => {
    if (!session || session.mode !== "cloud") return;
    const refreshCustomerActivity = () => {
      adminApi
        .listLeads(session.token)
        .then((records) => setCustomers(records.map(mapLeadToCustomer)))
        .catch(() => undefined);
      adminApi
        .getAnalytics(session.token)
        .then((records) => setAnalyticsEvents(records as AnalyticsEvent[]))
        .catch(() => undefined);
    };
    const timer = window.setInterval(refreshCustomerActivity, 30000);
    return () => window.clearInterval(timer);
  }, [session]);

  if (restoringSession)
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <img src={logoFull.src} alt="品诺筑家整装" />
          </div>
          <p className="login-restoring">正在恢复登录状态…</p>
        </div>
      </div>
    );
  if (restoringSession) return null;
  if (!session) return <Login onLogin={acceptSession} />;

  const visibleNavItems = navItems.filter(
    (item) =>
      session.admin.role === "超级管理员" ||
      !["admins", "settings"].includes(item.key),
  );
  const activeCase = selectedCase || cases[0];
  const canEditActiveCase =
    session.admin.role === "超级管理员" ||
    activeCase?.uploader === session.admin.username;
  const notificationCount = analyticsEvents.filter((event) =>
    ["favorite_add", "consultation", "share"].includes(event.type),
  ).length;

  return (
    <div className="admin-shell">
      <aside className={sidebarOpen ? "sidebar open" : "sidebar"}>
        <div className="sidebar-brand">
          <img src={logoMark.src} alt="" />
          <div>
            <strong>品诺筑家整装</strong>
            <span>PINNUO HOME</span>
          </div>
        </div>
        <nav>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={section === item.key ? "active" : ""}
                onClick={() => navigate(item.key)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      {sidebarOpen && (
        <button className="mobile-mask" onClick={() => setSidebarOpen(false)} />
      )}
      <main className="workspace">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)}>
            <Menu size={21} />
          </button>
          <div className="crumb">
            <span>管理后台</span>
            <i>/</i>
            <strong>{pageTitle[view]}</strong>
          </div>
          <div className="topbar-spacer" />
          <div className="top-actions">
            <button onClick={() => navigate("notifications")}>
              <Bell size={20} />
              {notificationCount > 0 && <i />}
            </button>
            <div className="account-shell">
              <button
                className="admin-user"
                onClick={() => setAccountMenu(!accountMenu)}
              >
                <span>PN</span>
                <div>
                  <strong>{session.admin.displayName}</strong>
                  <small>{session.admin.role}</small>
                </div>
                <ChevronDown size={15} />
              </button>
              {accountMenu && (
                <>
                  <button
                    className="account-backdrop"
                    onClick={() => setAccountMenu(false)}
                  />
                  <div className="account-menu">
                    <button
                      onClick={() => {
                        setAccountMenu(false);
                        setChangePasswordOpen(true);
                      }}
                    >
                      <KeyRound size={16} />
                      修改密码
                    </button>
                    {session.admin.role === "超级管理员" && (
                      <button
                        onClick={() => {
                          setAccountMenu(false);
                          navigate("admins");
                        }}
                      >
                        <UserCog size={16} />
                        账号管理
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setAccountMenu(false);
                        setConfirmLogout(true);
                      }}
                    >
                      <LogOut size={16} />
                      退出登录
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <div className="page-canvas">
          {view === "cases" && (
              <CasesList
                cases={cases}
                styles={styles}
                currentAdmin={session.admin}
                deleteCase={deleteCase}
                persistCasePatch={persistCasePatch}
                open={navigate}
                notify={notify}
              />
          )}
          {view === "case-preview" && (
            <CasePreview
              item={activeCase}
              canEdit={canEditActiveCase}
              back={() => navigate(caseReturnView)}
              edit={() => navigate("case-edit", activeCase)}
              notify={notify}
            />
          )}
          {view === "case-edit" && (
            <CaseEdit
              item={selectedCase || undefined}
              back={() =>
                selectedCase
                  ? navigate("case-preview", selectedCase)
                  : navigate("cases")
              }
              save={saveCase}
              notify={notify}
              communities={communities}
              styles={styles}
              spaces={spaces}
              currentUsername={session.admin.username}
              addCommunity={addCommunity}
              addStyle={addStyle}
              addSpace={addSpace}
              uploadAsset={uploadAsset}
            />
          )}
          {view === "customers" && (
            <Customers customers={customers} notify={notify} />
          )}
          {view === "analytics" && (
            <Analytics
              cases={cases}
              customers={customers}
              events={analyticsEvents}
              open={navigate}
            />
          )}
          {view === "notifications" && (
            <Notifications
              events={analyticsEvents}
              cases={cases}
              customers={customers}
              open={navigate}
            />
          )}
          {view === "tags" && (
            <TagsView
              session={session}
              notify={notify}
              communities={communities}
              styles={styles}
              spaces={spaces}
              updateCommunities={setCommunities}
              updateStyles={setStyles}
              updateSpaces={setSpaces}
            />
          )}
          {view === "admins" && (
            <Admins
              session={session}
              notify={notify}
              forceLogout={() => setSession(null)}
            />
          )}
          {view === "settings" && <SystemSettings notify={notify} />}
        </div>
      </main>
      {toast && <Toast>{toast}</Toast>}
      {(changePasswordOpen ||
        (session.admin.mustChangePassword && !passwordPromptDismissed)) && (
        <ChangePasswordDialog
          session={session}
          close={() => {
            setChangePasswordOpen(false);
            setPasswordPromptDismissed(true);
          }}
          complete={() => setSession(null)}
          notify={notify}
        />
      )}
      {confirmLogout && (
        <ConfirmDialog
          title="退出管理后台？"
          text="退出后需要重新输入管理员账号和密码。"
          cancel={() => setConfirmLogout(false)}
          confirm={() => {
            setConfirmLogout(false);
            setSession(null);
          }}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  title,
  text,
  cancel,
  confirm,
}: {
  title: string;
  text: string;
  cancel: () => void;
  confirm: () => void;
}) {
  return (
    <div className="dialog-layer">
      <button className="dialog-backdrop" onClick={cancel} />
      <section className="confirm-dialog">
        <div className="confirm-icon">
          <LogOut size={22} />
        </div>
        <h3>{title}</h3>
        <p>{text}</p>
        <div>
          <button className="line-button" onClick={cancel}>
            取消
          </button>
          <button className="danger-button" onClick={confirm}>
            确认退出
          </button>
        </div>
      </section>
    </div>
  );
}
