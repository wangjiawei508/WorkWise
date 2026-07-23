import { describe, expect, it } from 'vitest'
import { createDesignDocument, createDesignElement, createDesignPage } from '../../shared/design-document'
import { validateDesignExportAssets, validatePowerPointCanvasSize } from './design-export-service'

describe('validatePowerPointCanvasSize', () => {
  it('accepts a normal same-size slide deck', () => {
    const document = createDesignDocument({ format: 'ppt169' })
    document.pages.push(createDesignPage({ format: 'ppt169' }))
    expect(validatePowerPointCanvasSize(document)).toBeNull()
  })

  it('rejects a canvas outside the PPT Master contract', () => {
    const document = createDesignDocument({
      format: 'custom',
      customSize: { width: 5_377, height: 720 }
    })
    expect(validatePowerPointCanvasSize(document)).toContain('96 and 5376')
  })

  it('rejects mixed slide sizes because a PPTX has one page size', () => {
    const document = createDesignDocument({ format: 'ppt169' })
    document.pages.push(createDesignPage({ format: 'social-square' }))
    expect(validatePowerPointCanvasSize(document)).toContain('same canvas size')
  })
})

describe('validateDesignExportAssets', () => {
  it('rejects a visible image whose durable asset bytes are unavailable', () => {
    const document = createDesignDocument({ format: 'ppt169' })
    document.pages[0].elements.push(createDesignElement('image', {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      imageAssetId: 'asset_missing',
      zIndex: 0
    }))
    expect(validateDesignExportAssets(document, {})).toContain('missing or invalid')
  })

  it('accepts a validated embedded image for PPTX serialization', () => {
    const document = createDesignDocument({ format: 'ppt169' })
    document.pages[0].elements.push(createDesignElement('image', {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      imageAssetId: 'asset_ok',
      zIndex: 0
    }))
    expect(validateDesignExportAssets(document, {
      asset_ok: 'data:image/png;base64,iVBORw0KGgo='
    })).toBeNull()
  })
})
