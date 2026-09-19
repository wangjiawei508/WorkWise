import brand from '@shared/product-brand.json'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enCommon from './locales/en/common.json'
import zhCommon from './locales/zh/common.json'
import enSettings from './locales/en/settings.json'
import zhSettings from './locales/zh/settings.json'

for (const [locale, common] of [['zh', zhCommon], ['en', enCommon]] as const) {
  common.appName = brand.platform
  common.surveyProductName = brand.survey
  common.engineeringWorkbenchTitle = brand.survey
  common.engineeringWorkbenchSubtitle = brand.surveySubtitle[locale]
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, settings: enSettings },
    zh: { common: zhCommon, settings: zhSettings }
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false, defaultVariables: { productName: brand.platform, runtimeName: brand.runtime } },
  defaultNS: 'common',
  ns: ['common', 'settings']
})

export default i18n
