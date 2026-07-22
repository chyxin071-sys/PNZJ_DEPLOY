export interface CaseImage {
  id: string
  caseId: string
  url: string
  order: number
  alt: string
}

export type CaseStatus = 'draft' | 'published'

export interface Designer {
  id: string
  name: string
  avatar: string
  bio: string
  phone: string
  email: string
  casesCount?: number
}

export interface Community {
  id: string
  name: string
  sortOrder: number
  showOnHome: boolean
  coverImage: string
  description: string
  casesCount?: number
}

export interface Case {
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
  sortOrder: number        // 排序顺序
  status: CaseStatus      // 草稿/已发布
  designerId: string      // 设计师ID
  designer?: Designer     // 关联的设计师信息（通过API获取）
  createdAt: string
  updatedAt: string
}

export interface CreateCaseRequest {
  name: string
  community: string
  houseType: string
  style: string
  area?: number
  description?: string
  coverImage?: string
  featured?: boolean
  sortOrder?: number
  status?: CaseStatus
  designerId?: string
}

export interface UpdateCaseRequest extends Partial<CreateCaseRequest> {}

export interface UploadResponse {
  url: string
}

export interface UploadMultipleResponse {
  urls: string[]
}
