"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Menu,
  Phone,
  Search,
  X,
} from "lucide-react";
import logoFull from "./assets/logo-full.png";
import designerQr from "./assets/designer-qr.png";
import { publicCases, type PublicCase } from "./public-data";
import { publicApi } from "./admin-api";

type SiteContent = {
  brand?: { name?: string; slogan?: string };
  company?: { address?: string; businessHours?: string; phone?: string };
  media?: { aboutCover?: string };
};

function normalizePublicCases(records: Array<Record<string, unknown>>) {
  return records
    .map((record) => {
      const cover = String(record.cover || "");
      const images =
        Array.isArray(record.images) && record.images.length
          ? record.images.map(String)
          : cover
            ? [cover]
            : [];
      return {
        id: String(record.id || record.caseNo || record._id || ""),
        name: String(record.name || record.title || "未命名案例"),
        community: String(record.community || ""),
        area: Number(record.area) || 0,
        layout: String(record.layout || ""),
        style: String(record.style || ""),
        cover,
        images,
        imageSections: Array.isArray(record.imageSections)
          ? (record.imageSections as PublicCase["imageSections"])
          : [],
        description: String(record.description || ""),
        layoutInfo: String(record.layoutInfo || ""),
        highlights: String(record.highlights || ""),
        tags: Array.isArray(record.tags) ? record.tags.map(String) : [],
      } satisfies PublicCase;
    })
    .filter((item) => item.id && item.cover);
}

function usePublicContent() {
  const [cases, setCases] = useState(publicCases);
  const [siteConfig, setSiteConfig] = useState<SiteContent>({});

  useEffect(() => {
    publicApi
      .getPublicContent()
      .then((content) => {
        const nextCases = normalizePublicCases(content.cases);
        if (nextCases.length) setCases(nextCases);
        setSiteConfig((content.siteConfig || {}) as SiteContent);
      })
      .catch((error) => console.warn("官网暂时使用本地案例数据。", error));
  }, []);

  return { cases, siteConfig };
}

function PublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="public-header">
      <a href="/" className="public-brand" aria-label="品诺筑家首页">
        <img src={logoFull.src} alt="品诺筑家整装" />
      </a>
      <button
        className="public-menu"
        onClick={() => setOpen(!open)}
        aria-label={open ? "关闭导航" : "打开导航"}
      >
        {open ? <X /> : <Menu />}
      </button>
      <nav className={open ? "open" : ""}>
        <a href="/#works" onClick={() => setOpen(false)}>空间案例</a>
        <a href="/#approach" onClick={() => setOpen(false)}>整装方法</a>
        <a href="/#about" onClick={() => setOpen(false)}>关于品诺</a>
        <a href="/#contact" onClick={() => setOpen(false)}>预约咨询</a>
        <a className="public-nav-erp" href="/erp">客户中心</a>
      </nav>
    </header>
  );
}

function PublicLightbox({
  images,
  index,
  close,
  select,
}: {
  images: string[];
  index: number;
  close: () => void;
  select: (index: number) => void;
}) {
  const previous = () => select((index - 1 + images.length) % images.length);
  const next = () => select((index + 1) % images.length);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });

  return (
    <div className="public-lightbox" role="dialog" aria-modal="true">
      <button aria-label="关闭图片" className="public-lightbox-mask" onClick={close} />
      <img src={images[index]} alt="" />
      <span>{index + 1} / {images.length}</span>
      <button className="public-lightbox-close" aria-label="关闭" onClick={close}><X /></button>
      {images.length > 1 && (
        <>
          <button className="public-lightbox-arrow left" aria-label="上一张" onClick={previous}><ChevronLeft /></button>
          <button className="public-lightbox-arrow right" aria-label="下一张" onClick={next}><ChevronRight /></button>
        </>
      )}
    </div>
  );
}

function CaseCard({ item, index }: { item: PublicCase; index: number }) {
  return (
    <a className={`public-case-card public-case-card-${index % 5}`} href={`/case/${item.id}`}>
      <div>
        <img src={item.cover} alt={item.name} loading={index > 3 ? "lazy" : "eager"} decoding="async" />
        <span>{String(index + 1).padStart(2, "0")}</span>
        <i>查看案例 <ArrowRight size={15} /></i>
      </div>
      <header>
        <div>
          <p>{item.community} · {item.style}</p>
          <h3>{item.name}</h3>
        </div>
        <p>{item.layout}<br />{item.area}㎡</p>
      </header>
    </a>
  );
}

export function PublicSite() {
  const { cases, siteConfig } = usePublicContent();
  const [style, setStyle] = useState("全部");
  const [query, setQuery] = useState("");
  const styles = ["全部", ...Array.from(new Set(cases.map((item) => item.style).filter(Boolean)))];
  const filtered = useMemo(
    () =>
      cases.filter(
        (item) =>
          (style === "全部" || item.style === style) &&
          (!query || item.community.includes(query) || item.name.includes(query) || item.layout.includes(query)),
      ),
    [cases, query, style],
  );
  const heroCase = cases[0] || publicCases[0];
  const secondary = cases[1] || heroCase;
  const aboutImage =
    siteConfig.media?.aboutCover ||
    cases[Math.min(3, Math.max(cases.length - 1, 0))]?.cover ||
    heroCase.cover;
  const address =
    siteConfig.company?.address || "甘肃省嘉峪关市河西建材城品诺筑家整装";
  const businessHours = siteConfig.company?.businessHours || "9:00—18:00";

  return (
    <main className="public-site public-home">
      <PublicHeader />
      <section className="public-hero" id="home">
        <img className="public-hero-image" src={heroCase.cover} alt={heroCase.name} />
        <div className="public-hero-shade" />
        <div className="public-hero-copy">
          <p>PINNUO HOME · JIAYUGUAN</p>
          <h1>让设计<br />真正落地</h1>
          <div>
            <span>品诺有心，筑家有道</span>
            <a href={`/case/${heroCase.id}`}>探索本案 <ArrowRight size={18} /></a>
          </div>
        </div>
        <a className="public-hero-index" href="#works"><span>向下浏览</span><b>01</b></a>
      </section>

      <section className="public-intro" id="approach">
        <header>
          <span>01 / OUR APPROACH</span>
          <p>从真实生活出发，以设计统筹施工、主材、定制与软装，让审美、预算与最终交付始终保持一致。</p>
        </header>
        <h2>设计不是一张效果图<br />而是一个真正住得好的家</h2>
        <div className="public-intro-stats">
          <div><b>20+</b><span>年家装行业积累</span></div>
          <div><b>1:1</b><span>效果与落地协同</span></div>
          <div><b>全案</b><span>从设计到交付闭环</span></div>
        </div>
      </section>

      <section className="public-featured">
        <a href={`/case/${secondary.id}`}>
          <img src={secondary.cover} alt={secondary.name} />
          <div>
            <span>FEATURED RESIDENCE</span>
            <h2>{secondary.name}</h2>
            <p>{secondary.community} / {secondary.layout} / {secondary.area}㎡</p>
          </div>
        </a>
      </section>

      <section className="public-cases" id="works">
        <header>
          <div><span>02 / SELECTED WORKS</span><h2>空间案例</h2></div>
          <p>以真实小区与居住需求为索引，呈现从空间构想到最终落地的完整思考。</p>
        </header>
        <div className="public-case-tools">
          <label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索小区、案例或户型" /></label>
          <div>{styles.map((item) => <button className={style === item ? "active" : ""} onClick={() => setStyle(item)} key={item}>{item}</button>)}</div>
          <span>{filtered.length} PROJECTS</span>
        </div>
        <div className="public-case-grid">{filtered.map((item, index) => <CaseCard item={item} index={index} key={item.id} />)}</div>
        {filtered.length === 0 && <div className="public-no-cases">没有找到匹配案例，请更换关键词。</div>}
      </section>

      <section className="public-about public-about-redesign" id="about">
        <div className="public-about-image" style={{ backgroundImage: `url(${aboutImage})` }}>
          <span className="public-about-image-index">03</span>
          <p>PINNUO HOME<br />JIAYUGUAN</p>
        </div>
        <div className="public-about-content">
          <span>03 / ABOUT PINNUO</span>
          <h2>认真理解生活<br />再开始设计空间</h2>
          <div className="public-about-lead">我们相信，好的家不是风格的堆砌，而是对居住者真实需求的回应。</div>
          <p>品诺筑家扎根嘉峪关，从材料、施工到全案整装，长期参与每一个家的真实交付。我们把设计、预算、工艺、材料和现场管理放进同一套工作方法，让复杂的装修过程更清晰、更可控。</p>
          <p>每一个项目都从家庭结构、生活习惯与长期使用出发。好看只是起点，耐住、好用、真正落地，才是我们对设计的完整理解。</p>
          <div className="public-about-values">
            <article><b>01</b><strong>真实</strong><span>以生活需求为设计依据</span></article>
            <article><b>02</b><strong>克制</strong><span>让预算花在真正重要的地方</span></article>
            <article><b>03</b><strong>落地</strong><span>让图纸与最终的家保持一致</span></article>
          </div>
          <blockquote>{siteConfig.brand?.slogan || "品诺有心，筑家有道"}</blockquote>
        </div>
      </section>

      <section className="public-contact" id="contact">
        <div>
          <span>DESIGN CONSULTATION</span>
          <h2>聊聊你理想中的家</h2>
          <p>结合你的小区、户型与居住需求，获得一份更适合自己的设计建议。</p>
          <dl>
            <div><MapPin /><dt>公司地址</dt><dd>{address}</dd></div>
            <div><Clock3 /><dt>营业时间</dt><dd>每日 {businessHours}</dd></div>
            <div><Phone /><dt>咨询方式</dt><dd>扫码添加品诺筑家顾问微信</dd></div>
          </dl>
        </div>
        <figure><img src={designerQr.src} alt="品诺筑家顾问微信二维码" /><figcaption>扫码添加设计顾问</figcaption></figure>
      </section>

      <footer className="public-footer">
        <div><img src={logoFull.src} alt="品诺筑家整装" /><p>品诺有心，筑家有道</p></div>
        <div><a href="#works">案例</a><a href="#approach">方法</a><a href="#about">关于</a><a href="#contact">联系</a></div>
        <span>© 2026 PINNUO HOME</span>
      </footer>
    </main>
  );
}

export function PublicCaseDetail({ item }: { item: PublicCase }) {
  const { cases } = usePublicContent();
  const resolvedItem = cases.find((record) => record.id === item.id) || item;
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const images = resolvedItem.images.length ? resolvedItem.images : [resolvedItem.cover];
  const sections = (resolvedItem.imageSections || []).filter((section) => section.images?.length);
  const gallerySections = sections.length
    ? sections
    : [{ name: "全屋空间", images }];

  return (
    <main className="public-site public-detail public-detail-redesign">
      <PublicHeader />
      <div className="public-detail-back">
        <a href="/#works"><ChevronLeft size={18} />返回案例库</a>
      </div>

      <section className="public-project-cover">
        <button onClick={() => setLightbox({ images: [resolvedItem.cover], index: 0 })}>
          <img src={resolvedItem.cover} alt={resolvedItem.name} />
          <span>查看封面大图</span>
        </button>
        <aside>
          <p>RESIDENTIAL PROJECT</p>
          <h1>{resolvedItem.name}</h1>
          <div>
            <span>小区<strong>{resolvedItem.community}</strong></span>
            <span>户型<strong>{resolvedItem.layout}</strong></span>
            <span>面积<strong>{resolvedItem.area}㎡</strong></span>
            <span>风格<strong>{resolvedItem.style}</strong></span>
          </div>
          <em>品诺有心，筑家有道</em>
        </aside>
      </section>

      <section className="public-project-narrative">
        <header><span>PROJECT STORY</span><h2>从生活出发<br />找到空间的答案</h2></header>
        <div>
          <article><b>01</b><h3>案例说明</h3><p>{resolvedItem.description || "暂无案例说明"}</p></article>
          <article><b>02</b><h3>户型信息</h3><p>{resolvedItem.layoutInfo || "暂无户型信息"}</p></article>
          <article><b>03</b><h3>设计亮点</h3><p>{resolvedItem.highlights || "暂无设计亮点"}</p></article>
        </div>
      </section>

      <section className="public-project-spaces">
        <header><span>SPACE GALLERY</span><h2>空间漫游</h2><p>按照空间分区浏览效果图，点击任意图片可查看大图。</p></header>
        {gallerySections.map((section, sectionIndex) => (
          <article className="public-space-section" key={`${section.name}-${sectionIndex}`}>
            <header>
              <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
              <h3>{section.name}</h3>
              <p>{section.images.length} PHOTOS</p>
            </header>
            <div>
              {section.images.map((image, imageIndex) => (
                <button
                  className={imageIndex === 0 ? "public-space-image-featured" : ""}
                  onClick={() => setLightbox({ images: section.images, index: imageIndex })}
                  key={`${image}-${imageIndex}`}
                >
                  <img src={image} alt={`${section.name} ${imageIndex + 1}`} loading={sectionIndex === 0 && imageIndex < 2 ? "eager" : "lazy"} decoding="async" />
                  <span>{String(imageIndex + 1).padStart(2, "0")}</span>
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="public-detail-brand-end public-detail-brand-redesign">
        <div>
          <span>PINNUO HOME</span>
          <strong>品诺有心，筑家有道</strong>
          <p>让设计不止停留在想象，更成为日常生活的一部分。</p>
        </div>
        <img className="public-brand-end-qr" src={designerQr.src} alt="咨询二维码" />
      </section>
      <section className="public-detail-cta">
        <p>喜欢这个案例？让设计师结合你的户型给出建议。</p>
        <a href="/#contact">咨询设计师 <ArrowRight size={18} /></a>
      </section>

      {lightbox && (
        <PublicLightbox
          images={lightbox.images}
          index={lightbox.index}
          close={() => setLightbox(null)}
          select={(index) => setLightbox((current) => current ? { ...current, index } : null)}
        />
      )}
    </main>
  );
}
