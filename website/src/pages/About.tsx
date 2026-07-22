import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'

export default function About() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      {/* Hero */}
      <section className="relative h-[60vh] w-full overflow-hidden bg-gray-900">
        <img
          src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20interior%20design%20studio%20office%20space%20minimalist%20elegant%20workspace%20natural%20light&image_size=landscape_16_9"
          alt="品诺筑家"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-white/60 text-xs tracking-[0.3em] uppercase mb-4">ABOUT US</p>
            <h1 className="text-white text-4xl lg:text-5xl font-light tracking-wide">关于我们</h1>
          </div>
        </div>
      </section>

      {/* 公司简介 */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
          <h2 className="text-gray-900 text-2xl font-light tracking-wide mb-8">
            品诺筑家整装
          </h2>
          <div className="w-12 h-px bg-gray-300 mx-auto mb-8" />
          <p className="text-gray-600 text-base leading-relaxed font-light mb-6">
            品诺筑家整装成立于2015年，是一家专注于高端住宅室内设计与整装服务的专业公司。
            我们秉承"品诺有心，筑家有道"的理念，致力于为每一位业主打造独一无二的理想居所。
          </p>
          <p className="text-gray-600 text-base leading-relaxed font-light mb-6">
            公司拥有资深设计师团队30余人，累计服务超过2000个家庭，
            涵盖现代简约、新中式、轻奢、北欧等多种风格。我们坚持原创设计，
            注重空间功能与美学的完美融合，让每一处细节都体现生活品质。
          </p>
          <p className="text-gray-600 text-base leading-relaxed font-light">
            从方案设计到施工落地，我们提供一站式整装服务，
            严格把控每一个环节，确保设计理念得以精准呈现。
          </p>
        </div>
      </section>

      {/* 数据统计 */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
            <div>
              <p className="text-gray-900 text-4xl font-light mb-2">9+</p>
              <p className="text-gray-500 text-sm tracking-wider">年行业经验</p>
            </div>
            <div>
              <p className="text-gray-900 text-4xl font-light mb-2">2000+</p>
              <p className="text-gray-500 text-sm tracking-wider">服务家庭</p>
            </div>
            <div>
              <p className="text-gray-900 text-4xl font-light mb-2">30+</p>
              <p className="text-gray-500 text-sm tracking-wider">资深设计师</p>
            </div>
            <div>
              <p className="text-gray-900 text-4xl font-light mb-2">50+</p>
              <p className="text-gray-500 text-sm tracking-wider">合作小区</p>
            </div>
          </div>
        </div>
      </section>

      {/* 服务理念 */}
      <section className="py-24">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
          <h2 className="text-gray-900 text-2xl font-light tracking-wide text-center mb-4">
            服务理念
          </h2>
          <div className="w-12 h-px bg-gray-300 mx-auto mb-16" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-16 h-16 border border-gray-200 flex items-center justify-center mx-auto mb-6">
                <span className="text-gray-800 text-xl font-light">01</span>
              </div>
              <h3 className="text-gray-900 text-lg font-light tracking-wide mb-4">原创设计</h3>
              <p className="text-gray-500 text-sm leading-relaxed font-light">
                拒绝千篇一律的模板化设计，每个案例都是根据业主需求量身定制
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 border border-gray-200 flex items-center justify-center mx-auto mb-6">
                <span className="text-gray-800 text-xl font-light">02</span>
              </div>
              <h3 className="text-gray-900 text-lg font-light tracking-wide mb-4">品质施工</h3>
              <p className="text-gray-500 text-sm leading-relaxed font-light">
                严选环保材料，标准化施工流程，确保每一个环节都经得起检验
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 border border-gray-200 flex items-center justify-center mx-auto mb-6">
                <span className="text-gray-800 text-xl font-light">03</span>
              </div>
              <h3 className="text-gray-900 text-lg font-light tracking-wide mb-4">全程服务</h3>
              <p className="text-gray-500 text-sm leading-relaxed font-light">
                从设计咨询到售后保障，专业团队全程跟进，让您省心无忧
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
