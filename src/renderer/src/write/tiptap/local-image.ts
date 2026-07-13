import { Image } from '@tiptap/extension-image'
import {
  initialWriteMarkdownImageSrc,
  loadWriteMarkdownImage
} from '../markdown-image'

export type WriteLocalImageOptions = {
  /** Absolute path of the markdown file being edited; relative image
   * sources resolve against its directory. */
  getFilePath: () => string
}

/**
 * Image node that keeps the raw (usually workspace-relative) `src` attribute
 * intact for markdown serialization while displaying the resolved file:// URL
 * inside the editor.
 */
export const WriteLocalImage = Image.extend<WriteLocalImageOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      getFilePath: () => ''
    }
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('img')
      dom.className = 'write-rich-image'
      dom.alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : ''
      const applySrc = (src: unknown): void => {
        const raw = typeof src === 'string' ? src : ''
        const filePath = this.options.getFilePath() || null
        const initialSrc = initialWriteMarkdownImageSrc(raw, filePath)
        if (initialSrc) {
          dom.src = initialSrc
        } else {
          dom.removeAttribute('src')
        }
        dom.classList.remove('write-rich-image-error')
        dom.removeAttribute('title')
        dom.dataset.rawSrc = raw
        void loadWriteMarkdownImage(raw, filePath)
          .then((result) => {
            if (dom.dataset.rawSrc !== raw) return
            if (result.ok) {
              dom.src = result.src
              dom.classList.remove('write-rich-image-error')
              dom.removeAttribute('title')
              return
            }
            dom.removeAttribute('src')
            dom.classList.add('write-rich-image-error')
            dom.title = result.message
          })
          .catch((error) => {
            if (dom.dataset.rawSrc !== raw) return
            dom.removeAttribute('src')
            dom.classList.add('write-rich-image-error')
            dom.title = error instanceof Error ? error.message : String(error)
          })
      }
      applySrc(node.attrs.src)
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== node.type.name) return false
          if (dom.dataset.rawSrc !== updated.attrs.src) applySrc(updated.attrs.src)
          dom.alt = typeof updated.attrs.alt === 'string' ? updated.attrs.alt : ''
          return true
        }
      }
    }
  }
})
