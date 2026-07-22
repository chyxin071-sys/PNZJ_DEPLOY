import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import path from 'path'
import fs from 'fs'

interface CaseImage {
  id: string
  caseId: string
  url: string
  order: number
  alt: string
}

type CaseStatus = 'draft' | 'published'

interface Designer {
  id: string
  name: string
  avatar: string
  bio: string
  phone: string
  email: string
  createdAt: string
  updatedAt: string
}

interface Community {
  id: string
  name: string
  sortOrder: number
  showOnHome: boolean
  coverImage: string
  description: string
  createdAt: string
  updatedAt: string
}

interface Case {
  id: string
  name: string
  community: string
  houseType: string
  style: string
  area: number
  description: string
  coverImage: string
  images: CaseImage[]
  featured: boolean       // 是否首页推荐
  sortOrder: number      // 排序顺序
  status: CaseStatus     // 草稿/已发布
  designerId: string     // 设计师ID引用
  createdAt: string
  updatedAt: string
}

interface Database {
  cases: Case[]
  designers: Designer[]
  communities: Community[]
}

const dbPath = path.join(process.cwd(), 'api', 'database', 'db.json')

// 默认设计师数据
const defaultDesigners: Designer[] = [
  {
    id: 'd1',
    name: '李明',
    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=professional%20interior%20designer%20portrait%20photo%20male%20formal%20wear&image_size=portrait_4_3',
    bio: '从业10年，专注现代简约与轻奢风格，善于将空间功能与美学完美融合。',
    phone: '138-0000-0001',
    email: 'liming@pinuozhujia.com',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'd2',
    name: '王芳',
    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=professional%20interior%20designer%20portrait%20photo%20female%20elegant&image_size=portrait_4_3',
    bio: '擅长新中式与北欧风格，注重细节与品质，为客户打造温馨舒适的家。',
    phone: '138-0000-0002',
    email: 'wangfang@pinuozhujia.com',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'd3',
    name: '张伟',
    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=professional%20interior%20designer%20portrait%20photo%20male%20casual%20smart&image_size=portrait_4_3',
    bio: '专注高端住宅设计，倡导原创设计理念，作品多次获奖。',
    phone: '138-0000-0003',
    email: 'zhangwei@pinuozhujia.com',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'd4',
    name: '陈静',
    avatar: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=professional%20interior%20designer%20portrait%20photo%20female%20young%20professional&image_size=portrait_4_3',
    bio: '精通各类装修风格，以人为本，注重空间与人的关系。',
    phone: '138-0000-0004',
    email: 'chenjing@pinuozhujia.com',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  }
]

// 默认小区数据
const defaultCommunities: Community[] = [
  {
    id: 'c1',
    name: '南湖国际C区',
    sortOrder: 1,
    showOnHome: true,
    coverImage: '',
    description: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'c2',
    name: '星河湾',
    sortOrder: 2,
    showOnHome: true,
    coverImage: '',
    description: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'c3',
    name: '翡翠城',
    sortOrder: 3,
    showOnHome: true,
    coverImage: '',
    description: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'c4',
    name: '碧桂园',
    sortOrder: 4,
    showOnHome: true,
    coverImage: '',
    description: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  }
]

const mockData: Database = {
  cases: [
    {
      id: "1",
      name: "南湖国际C区 现代简约",
      community: "南湖国际C区",
      houseType: "110㎡",
      style: "现代简约",
      area: 110,
      description: "本案采用现代简约风格，以简洁的线条和明快的色彩营造出舒适通透的居住空间。开放式布局让客厅与餐厅融为一体，充分利用自然光，使空间显得更加宽敞明亮。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20minimalist%20living%20room%20interior%20design%20with%20clean%20lines%20white%20walls%20large%20windows%20contemporary%20furniture%20warm%20lighting&image_size=landscape_16_9",
      images: [
        { id: "1-1", caseId: "1", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20minimalist%20living%20room%20interior%20design%20with%20clean%20lines%20white%20walls%20large%20windows%20contemporary%20furniture%20warm%20lighting&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "1-2", caseId: "1", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20minimalist%20dining%20room%20with%20wooden%20table%20elegant%20chairs%20pendant%20light%20clean%20design&image_size=landscape_16_9", order: 1, alt: "餐厅" },
        { id: "1-3", caseId: "1", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20minimalist%20bedroom%20with%20neutral%20colors%20soft%20bedding%20large%20window%20peaceful%20atmosphere&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "1-4", caseId: "1", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20minimalist%20kitchen%20with%20white%20cabinets%20stainless%20steel%20appliances%20wooden%20countertop&image_size=landscape_16_9", order: 3, alt: "厨房" }
      ],
      featured: true,
      sortOrder: 1,
      status: "published",
      designerId: 'd1',
      createdAt: "2024-01-15T10:00:00.000Z",
      updatedAt: "2024-01-15T10:00:00.000Z"
    },
    {
      id: "2",
      name: "南湖国际C区 新中式",
      community: "南湖国际C区",
      houseType: "120㎡",
      style: "新中式",
      area: 120,
      description: "新中式风格将传统中式元素与现代设计手法完美融合，既有东方美学的雅致韵味，又具备现代生活的舒适便捷。实木家具与水墨意境的软装搭配，营造出典雅大气的居住氛围。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=chinese%20new%20style%20living%20room%20interior%20with%20wooden%20furniture%20traditional%20elements%20modern%20lighting%20elegant%20decoration&image_size=landscape_16_9",
      images: [
        { id: "2-1", caseId: "2", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=chinese%20new%20style%20living%20room%20interior%20with%20wooden%20furniture%20traditional%20elements%20modern%20lighting%20elegant%20decoration&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "2-2", caseId: "2", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=chinese%20new%20style%20dining%20room%20with%20round%20wooden%20table%20traditional%20chinese%20chairs%20warm%20ambient%20lighting&image_size=landscape_16_9", order: 1, alt: "餐厅" },
        { id: "2-3", caseId: "2", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=chinese%20new%20style%20bedroom%20with%20wooden%20bed%20traditional%20bedding%20calligraphy%20art%20peaceful%20zen%20atmosphere&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "2-4", caseId: "2", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=chinese%20new%20style%20 study%20room%20with%20wooden%20desk%20bookshelf%20ink%20painting%20zen%20atmosphere&image_size=landscape_16_9", order: 3, alt: "书房" }
      ],
      featured: true,
      sortOrder: 2,
      status: "published",
      designerId: 'd2',
      createdAt: "2024-01-16T10:00:00.000Z",
      updatedAt: "2024-01-16T10:00:00.000Z"
    },
    {
      id: "7",
      name: "南湖国际C区 轻奢风格",
      community: "南湖国际C区",
      houseType: "130㎡",
      style: "轻奢风格",
      area: 130,
      description: "轻奢风格以低调奢华为设计理念，本案采用高级灰与金色的经典搭配，搭配精致的金属线条和大理石元素，打造出品质感十足的居住空间。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20modern%20apartment%20living%20room%20grey%20gold%20accent%20marble%20coffee%20table%20designer%20sofa%20chandelier&image_size=landscape_16_9",
      images: [
        { id: "7-1", caseId: "7", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20modern%20apartment%20living%20room%20grey%20gold%20accent%20marble%20coffee%20table%20designer%20sofa%20chandelier&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "7-2", caseId: "7", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20modern%20master%20bedroom%20with%20tufted%20headboard%20gold%20lamps%20elegant%20nightstands&image_size=landscape_16_9", order: 1, alt: "主卧" },
        { id: "7-3", caseId: "7", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20modern%20bathroom%20marble%20walls%20gold%20fixtures%20freestanding%20tub%20rain%20shower&image_size=landscape_16_9", order: 2, alt: "主卫" },
        { id: "7-4", caseId: "7", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20modern%20walk%20in%20closet%20with%20glass%20doors%20gold%20handles%20island%20display&image_size=landscape_16_9", order: 3, alt: "衣帽间" }
      ],
      featured: false,
      sortOrder: 3,
      status: "published",
      designerId: 'd3',
      createdAt: "2024-01-21T10:00:00.000Z",
      updatedAt: "2024-01-21T10:00:00.000Z"
    },
    {
      id: "8",
      name: "南湖国际C区 日式原木",
      community: "南湖国际C区",
      houseType: "95㎡",
      style: "日式原木",
      area: 95,
      description: "日式原木风格追求自然质朴，本案大量使用原木材质，搭配素净的墙面和柔和的光线，营造出宁静禅意的居住氛围。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=japanese%20style%20living%20room%20wooden%20furniture%20tatami%20shoji%20screen%20natural%20light%20minimalist&image_size=landscape_16_9",
      images: [
        { id: "8-1", caseId: "8", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=japanese%20style%20living%20room%20wooden%20furniture%20tatami%20shoji%20screen%20natural%20light%20minimalist&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "8-2", caseId: "8", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=japanese%20style%20bedroom%20with%20low%20platform%20bed%20wooden%20floor%20soft%20lighting&image_size=landscape_16_9", order: 1, alt: "卧室" },
        { id: "8-3", caseId: "8", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=japanese%20style%20tea%20room%20with%20tatami%20mat%20low%20table%20zen%20garden%20view&image_size=landscape_16_9", order: 2, alt: "茶室" },
        { id: "8-4", caseId: "8", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=japanese%20style%20kitchen%20with%20wooden%20cabinets%20simple%20clean%20design%20natural%20materials&image_size=landscape_16_9", order: 3, alt: "厨房" }
      ],
      featured: false,
      sortOrder: 4,
      status: "published",
      designerId: 'd4',
      createdAt: "2024-01-22T10:00:00.000Z",
      updatedAt: "2024-01-22T10:00:00.000Z"
    },
    {
      id: "3",
      name: "星河湾 轻奢美式",
      community: "星河湾",
      houseType: "140㎡",
      style: "轻奢美式",
      area: 140,
      description: "轻奢美式风格以优雅的线条和精致的细节著称，本案采用暖色调为主，搭配黄铜金属元素和大理石材质，营造出温馨而不失格调的居住空间。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20american%20style%20living%20room%20with%20elegant%20sofa%20marble%20fireplace%20brass%20accents%20warm%20lighting&image_size=landscape_16_9",
      images: [
        { id: "3-1", caseId: "3", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20american%20style%20living%20room%20with%20elegant%20sofa%20marble%20fireplace%20brass%20accents%20warm%20lighting&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "3-2", caseId: "3", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20american%20style%20dining%20room%20with%20crystal%20chandelier%20wooden%20dining%20set%20elegant%20decor&image_size=landscape_16_9", order: 1, alt: "餐厅" },
        { id: "3-3", caseId: "3", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20american%20style%20master%20bedroom%20with%20four%20poster%20bed%20velvet%20headboard%20soft%20carpet&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "3-4", caseId: "3", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20american%20style%20 study%20with%20wooden%20bookshelves%20leather%20chair%20fireplace&image_size=landscape_16_9", order: 3, alt: "书房" }
      ],
      featured: true,
      sortOrder: 5,
      status: "published",
      designerId: 'd1',
      createdAt: "2024-01-17T10:00:00.000Z",
      updatedAt: "2024-01-17T10:00:00.000Z"
    },
    {
      id: "4",
      name: "星河湾 北欧风格",
      community: "星河湾",
      houseType: "95㎡",
      style: "北欧风格",
      area: 95,
      description: "北欧风格以简洁、自然、人性化著称，本案采用大量的白色和原木色，搭配绿色植物和柔和的灯光，营造出清新舒适的居住环境。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=nordic%20style%20living%20room%20interior%20with%20white%20walls%20wooden%20floor%20cozy%20sofa%20plants%20natural%20light&image_size=landscape_16_9",
      images: [
        { id: "4-1", caseId: "4", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=nordic%20style%20living%20room%20interior%20with%20white%20walls%20wooden%20floor%20cozy%20sofa%20plants%20natural%20light&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "4-2", caseId: "4", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=nordic%20style%20kitchen%20with%20white%20cabinets%20wooden%20accents%20minimalist%20design%20bright%20space&image_size=landscape_16_9", order: 1, alt: "厨房" },
        { id: "4-3", caseId: "4", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=nordic%20style%20bedroom%20with%20soft%20bedding%20wooden%20furniture%20plants%20cozy%20atmosphere&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "4-4", caseId: "4", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=nordic%20style%20bathroom%20with%20white%20tiles%20wooden%20vanity%20plants%20clean%20design&image_size=landscape_16_9", order: 3, alt: "卫生间" }
      ],
      featured: false,
      sortOrder: 6,
      status: "published",
      designerId: 'd2',
      createdAt: "2024-01-18T10:00:00.000Z",
      updatedAt: "2024-01-18T10:00:00.000Z"
    },
    {
      id: "9",
      name: "星河湾 法式轻奢",
      community: "星河湾",
      houseType: "160㎡",
      style: "法式轻奢",
      area: 160,
      description: "法式轻奢风格融合了法式的浪漫优雅与现代的简约精致，本案运用精致的石膏线条、柔和的色彩和华丽的灯饰，营造出典雅浪漫的居住氛围。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=french%20style%20luxury%20living%20room%20with%20elegant%20moldings%20chandelier%20velvet%20sofa%20parquet%20floor&image_size=landscape_16_9",
      images: [
        { id: "9-1", caseId: "9", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=french%20style%20luxury%20living%20room%20with%20elegant%20moldings%20chandelier%20velvet%20sofa%20parquet%20floor&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "9-2", caseId: "9", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=french%20style%20dining%20room%20with%20crystal%20chandelier%20oval%20table%20upholstered%20chairs&image_size=landscape_16_9", order: 1, alt: "餐厅" },
        { id: "9-3", caseId: "9", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=french%20style%20master%20bedroom%20with%20canopy%20bed%20silk%20curtains%20dressing%20table&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "9-4", caseId: "9", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=french%20style%20bathroom%20with%20marble%20tiles%20clawfoot%20tub%20gold%20fixtures&image_size=landscape_16_9", order: 3, alt: "主卫" }
      ],
      featured: false,
      sortOrder: 7,
      status: "published",
      designerId: 'd3',
      createdAt: "2024-01-23T10:00:00.000Z",
      updatedAt: "2024-01-23T10:00:00.000Z"
    },
    {
      id: "10",
      name: "星河湾 现代简约",
      community: "星河湾",
      houseType: "120㎡",
      style: "现代简约",
      area: 120,
      description: "现代简约风格追求少即是多的设计理念，本案以黑白灰为主色调，搭配简洁的家具和利落的线条，打造出时尚舒适的现代居所。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20contemporary%20living%20room%20black%20white%20grey%20monochrome%20design%20floor%20to%20ceiling%20windows&image_size=landscape_16_9",
      images: [
        { id: "10-1", caseId: "10", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20contemporary%20living%20room%20black%20white%20grey%20monochrome%20design%20floor%20to%20ceiling%20windows&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "10-2", caseId: "10", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20contemporary%20open%20kitchen%20with%20island%20black%20cabinets%20concrete%20countertop&image_size=landscape_16_9", order: 1, alt: "厨房" },
        { id: "10-3", caseId: "10", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20contemporary%20bedroom%20with%20platform%20bed%20floating%20nightstands%20recessed%20lighting&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "10-4", caseId: "10", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20contemporary%20home%20office%20with%20minimalist%20desk%20built%20in%20shelves%20accent%20wall&image_size=landscape_16_9", order: 3, alt: "书房" }
      ],
      featured: false,
      sortOrder: 8,
      status: "published",
      designerId: 'd4',
      createdAt: "2024-01-24T10:00:00.000Z",
      updatedAt: "2024-01-24T10:00:00.000Z"
    },
    {
      id: "5",
      name: "翡翠城 轻奢风格",
      community: "翡翠城",
      houseType: "130㎡",
      style: "轻奢风格",
      area: 130,
      description: "轻奢风格注重细节与品质，本案以高级灰为主色调，搭配金色装饰线条和精致的软装，呈现出低调奢华的居住品味。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20modern%20living%20room%20with%20grey%20tones%20gold%20accents%20designer%20furniture%20elegant%20chandelier&image_size=landscape_16_9",
      images: [
        { id: "5-1", caseId: "5", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20modern%20living%20room%20with%20grey%20tones%20gold%20accents%20designer%20furniture%20elegant%20chandelier&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "5-2", caseId: "5", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20modern%20dining%20room%20with%20gold%20frame%20mirror%20elegant%20chairs%20ambient%20lighting&image_size=landscape_16_9", order: 1, alt: "餐厅" },
        { id: "5-3", caseId: "5", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20modern%20bathroom%20with%20marble%20surfaces%20gold%20fixtures%20freestanding%20bathtub&image_size=landscape_16_9", order: 2, alt: "卫生间" },
        { id: "5-4", caseId: "5", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=luxury%20modern%20bedroom%20with%20upholstered%20headboard%20gold%20lamps%20nightstands&image_size=landscape_16_9", order: 3, alt: "主卧" }
      ],
      featured: false,
      sortOrder: 9,
      status: "published",
      designerId: 'd1',
      createdAt: "2024-01-19T10:00:00.000Z",
      updatedAt: "2024-01-19T10:00:00.000Z"
    },
    {
      id: "11",
      name: "翡翠城 北欧风格",
      community: "翡翠城",
      houseType: "110㎡",
      style: "北欧风格",
      area: 110,
      description: "北欧风格以简约自然著称，本案采用温暖的木质元素和清新的配色，搭配舒适的软装，打造出温馨治愈的家居空间。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=scandinavian%20style%20bright%20living%20room%20wooden%20furniture%20white%20walls%20plants%20cozy%20nook&image_size=landscape_16_9",
      images: [
        { id: "11-1", caseId: "11", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=scandinavian%20style%20bright%20living%20room%20wooden%20furniture%20white%20walls%20plants%20cozy%20nook&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "11-2", caseId: "11", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=scandinavian%20style%20dining%20room%20with%20wooden%20table%20bench%20pendant%20lights%20plants&image_size=landscape_16_9", order: 1, alt: "餐厅" },
        { id: "11-3", caseId: "11", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=scandinavian%20style%20bedroom%20with%20linen%20bedding%20wooden%20furniture%20sheer%20curtains&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "11-4", caseId: "11", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=scandinavian%20style%20kitchen%20with%20wooden%20cabinets%20open%20shelving%20white%20tile%20backsplash&image_size=landscape_16_9", order: 3, alt: "厨房" }
      ],
      featured: false,
      sortOrder: 10,
      status: "published",
      designerId: 'd2',
      createdAt: "2024-01-25T10:00:00.000Z",
      updatedAt: "2024-01-25T10:00:00.000Z"
    },
    {
      id: "12",
      name: "翡翠城 新中式",
      community: "翡翠城",
      houseType: "140㎡",
      style: "新中式",
      area: 140,
      description: "新中式风格将传统东方美学与现代生活方式相结合，本案运用红木家具、水墨画意境和现代材质，打造出典雅大气的新中式居所。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=new%20chinese%20style%20living%20room%20with%20wooden%20furniture%20ink%20painting%20lattice%20screen%20modern%20twist&image_size=landscape_16_9",
      images: [
        { id: "12-1", caseId: "12", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=new%20chinese%20style%20living%20room%20with%20wooden%20furniture%20ink%20painting%20lattice%20screen%20modern%20twist&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "12-2", caseId: "12", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=new%20chinese%20style%20dining%20room%20with%20round%20table%20wooden%20chairs%20pendant%20lantern%20lights&image_size=landscape_16_9", order: 1, alt: "餐厅" },
        { id: "12-3", caseId: "12", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=new%20chinese%20style%20bedroom%20with%20wooden%20bed%20silk%20bedding%20calligraphy%20artwork&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "12-4", caseId: "12", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=new%20chinese%20style%20tea%20room%20with%20low%20table%20floor%20cushions%20bamboo%20blinds&image_size=landscape_16_9", order: 3, alt: "茶室" }
      ],
      featured: false,
      sortOrder: 11,
      status: "published",
      designerId: 'd3',
      createdAt: "2024-01-26T10:00:00.000Z",
      updatedAt: "2024-01-26T10:00:00.000Z"
    },
    {
      id: "13",
      name: "翡翠城 现代简约",
      community: "翡翠城",
      houseType: "90㎡",
      style: "现代简约",
      area: 90,
      description: "现代简约风格以简洁实用为核心，本案通过合理的空间规划和精致的细节处理，在有限的面积内打造出舒适宜居的现代家居。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=small%20apartment%20modern%20minimalist%20living%20room%20space%20saving%20furniture%20smart%20storage%20bright%20airy&image_size=landscape_16_9",
      images: [
        { id: "13-1", caseId: "13", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=small%20apartment%20modern%20minimalist%20living%20room%20space%20saving%20furniture%20smart%20storage%20bright%20airy&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "13-2", caseId: "13", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=small%20apartment%20open%20kitchen%20with%20island%20white%20cabinets%20space%20efficient%20design&image_size=landscape_16_9", order: 1, alt: "厨房" },
        { id: "13-3", caseId: "13", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=small%20bedroom%20with%20built%20in%20wardrobe%20floating%20shelves%20cozy%20minimalist%20style&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "13-4", caseId: "13", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=small%20bathroom%20with%20walk%20in%20shower%20wall%20mounted%20vanity%20modern%20tiles&image_size=landscape_16_9", order: 3, alt: "卫生间" }
      ],
      featured: false,
      sortOrder: 12,
      status: "published",
      designerId: 'd4',
      createdAt: "2024-01-27T10:00:00.000Z",
      updatedAt: "2024-01-27T10:00:00.000Z"
    },
    {
      id: "6",
      name: "碧桂园 田园风格",
      community: "碧桂园",
      houseType: "150㎡",
      style: "田园风格",
      area: 150,
      description: "田园风格追求自然与舒适，本案采用碎花布艺、木质元素和清新的色彩搭配，营造出如诗如画的居住空间，让人心旷神怡。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=country%20farmhouse%20style%20living%20room%20with%20floral%20fabric%20wooden%20furniture%20cozy%20fireplace%20warm%20atmosphere&image_size=landscape_16_9",
      images: [
        { id: "6-1", caseId: "6", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=country%20farmhouse%20style%20living%20room%20with%20floral%20fabric%20wooden%20furniture%20cozy%20fireplace%20warm%20atmosphere&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "6-2", caseId: "6", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=country%20farmhouse%20style%20kitchen%20with%20wooden%20cabinets%20farmhouse%20sink%20rustic%20charm&image_size=landscape_16_9", order: 1, alt: "厨房" },
        { id: "6-3", caseId: "6", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=country%20farmhouse%20style%20bedroom%20with%20patchwork%20quilt%20vintage%20furniture%20garden%20view&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "6-4", caseId: "6", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=country%20farmhouse%20style%20dining%20room%20with%20wooden%20table%20mismatched%20chairs%20pendant%20lights&image_size=landscape_16_9", order: 3, alt: "餐厅" }
      ],
      featured: false,
      sortOrder: 13,
      status: "published",
      designerId: 'd1',
      createdAt: "2024-01-20T10:00:00.000Z",
      updatedAt: "2024-01-20T10:00:00.000Z"
    },
    {
      id: "14",
      name: "碧桂园 美式乡村",
      community: "碧桂园",
      houseType: "120㎡",
      style: "美式乡村",
      area: 120,
      description: "美式乡村风格以舒适自然为核心，本案采用复古的木质家具、温暖的色调和怀旧的装饰元素，营造出温馨惬意的乡村居住氛围。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=american%20country%20style%20living%20room%20with%20wooden%20beams%20stone%20fireplace%20plaid%20sofa%20cozy%20warm&image_size=landscape_16_9",
      images: [
        { id: "14-1", caseId: "14", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=american%20country%20style%20living%20room%20with%20wooden%20beams%20stone%20fireplace%20plaid%20sofa%20cozy%20warm&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "14-2", caseId: "14", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=american%20country%20style%20kitchen%20with%20wooden%20cabinets%20brick%20backsplash%20farmhouse%20sink&image_size=landscape_16_9", order: 1, alt: "厨房" },
        { id: "14-3", caseId: "14", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=american%20country%20style%20bedroom%20with%20wooden%20furniture%20quilt%20vintage%20decor%20cozy&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "14-4", caseId: "14", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=american%20country%20style%20porch%20with%20rocking%20chairs%20hanging%20plants%20wooden%20swing&image_size=landscape_16_9", order: 3, alt: "阳台" }
      ],
      featured: false,
      sortOrder: 14,
      status: "draft",
      designerId: 'd2',
      createdAt: "2024-01-28T10:00:00.000Z",
      updatedAt: "2024-01-28T10:00:00.000Z"
    },
    {
      id: "15",
      name: "碧桂园 地中海",
      community: "碧桂园",
      houseType: "100㎡",
      style: "地中海",
      area: 100,
      description: "地中海风格以蓝白色调为主，本案运用拱形门、马赛克瓷砖和海洋元素，营造出清新浪漫、自由奔放的地中海风情。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=mediterranean%20style%20living%20room%20with%20blue%20white%20colors%20arched%20doorways%20terracotta%20tiles%20ocean%20view&image_size=landscape_16_9",
      images: [
        { id: "15-1", caseId: "15", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=mediterranean%20style%20living%20room%20with%20blue%20white%20colors%20arched%20doorways%20terracotta%20tiles%20ocean%20view&image_size=landscape_16_9", order: 0, alt: "客厅" },
        { id: "15-2", caseId: "15", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=mediterranean%20style%20kitchen%20with%20blue%20tiles%20white%20cabinets%20terracotta%20floor%20mosaic%20accents&image_size=landscape_16_9", order: 1, alt: "厨房" },
        { id: "15-3", caseId: "15", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=mediterranean%20style%20bedroom%20with%20blue%20white%20bedding%20canopy%20bed%20sea%20view&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "15-4", caseId: "15", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=mediterranean%20style%20bathroom%20with%20blue%20mosaic%20tiles%20clawfoot%20tub%20arched%20window&image_size=landscape_16_9", order: 3, alt: "卫生间" }
      ],
      featured: false,
      sortOrder: 15,
      status: "published",
      designerId: 'd3',
      createdAt: "2024-01-29T10:00:00.000Z",
      updatedAt: "2024-01-29T10:00:00.000Z"
    },
    {
      id: "16",
      name: "碧桂园 现代简约",
      community: "碧桂园",
      houseType: "140㎡",
      style: "现代简约",
      area: 140,
      description: "现代简约风格以简洁大方为特点，本案采用开放式布局和明亮的色彩搭配，结合智能化家居设计，打造出时尚便捷的现代生活空间。",
      coverImage: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20minimalist%20open%20plan%20living%20dining%20kitchen%20with%20floor%20to%20ceiling%20windows%20smart%20home&image_size=landscape_16_9",
      images: [
        { id: "16-1", caseId: "16", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20minimalist%20open%20plan%20living%20dining%20kitchen%20with%20floor%20to%20ceiling%20windows%20smart%20home&image_size=landscape_16_9", order: 0, alt: "客餐厅" },
        { id: "16-2", caseId: "16", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20minimalist%20kitchen%20with%20handleless%20cabinets%20island%20bar%20stools%20appliances&image_size=landscape_16_9", order: 1, alt: "厨房" },
        { id: "16-3", caseId: "16", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20minimalist%20master%20bedroom%20with%20floor%20to%20ceiling%20wardrobe%20ambient%20lighting&image_size=landscape_16_9", order: 2, alt: "主卧" },
        { id: "16-4", caseId: "16", url: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20minimalist%20home%20office%20with%20built%20in%20desk%20wall%20mounted%20shelves%20clean%20lines&image_size=landscape_16_9", order: 3, alt: "书房" }
      ],
      featured: false,
      sortOrder: 16,
      status: "published",
      designerId: 'd4',
      createdAt: "2024-01-30T10:00:00.000Z",
      updatedAt: "2024-01-30T10:00:00.000Z"
    }
  ],
  designers: defaultDesigners,
  communities: defaultCommunities
}

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify(mockData, null, 2))
}

const adapter = new JSONFile<Database>(dbPath)
const db = new Low(adapter, mockData)

await db.read()

if (!db.data || db.data.cases.length === 0) {
  db.data = mockData
  await db.write()
}

// 确保 designers 数组存在
if (!db.data.designers || db.data.designers.length === 0) {
  db.data.designers = defaultDesigners
  await db.write()
}

// 确保 communities 数组存在
if (!db.data.communities || db.data.communities.length === 0) {
  db.data.communities = defaultCommunities
  await db.write()
}

export default db

export type { Case, CaseImage, Database, Designer, Community }
