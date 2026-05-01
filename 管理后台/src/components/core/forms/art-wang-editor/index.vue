<!-- WangEditor 富文本编辑器 插件地址：https://www.wangeditor.com/ -->
<template>
  <div class="editor-wrapper">
    <Toolbar
      class="editor-toolbar"
      :editor="editorRef"
      :mode="mode"
      :defaultConfig="toolbarConfig"
    />
    <Editor
      :style="{ height: height, overflowY: 'hidden' }"
      v-model="modelValue"
      :mode="mode"
      :defaultConfig="editorConfig"
      @onCreated="onCreateEditor"
    />
  </div>
</template>

<script setup lang="ts">
  import '@wangeditor/editor/dist/css/style.css'
  import { onBeforeUnmount, onMounted, shallowRef, computed } from 'vue'
  import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
  import { useUserStore } from '@/store/modules/user'
  import EmojiText from '@/utils/ui/emojo'
  import { IDomEditor, IToolbarConfig, IEditorConfig } from '@wangeditor/editor'

  defineOptions({ name: 'ArtWangEditor' })

  // Props 定义
  interface Props {
    /** 编辑器高度 */
    height?: string
    /** 自定义工具栏配置 */
    toolbarKeys?: string[]
    /** 插入新工具到指定位置 */
    insertKeys?: { index: number; keys: string[] }
    /** 排除的工具栏项 */
    excludeKeys?: string[]
    /** 编辑器模式 */
    mode?: 'default' | 'simple'
    /** 占位符文本 */
    placeholder?: string
    /** 上传配置 */
    uploadConfig?: {
      maxFileSize?: number
      maxNumberOfFiles?: number
      server?: string
    }
  }

  const props = withDefaults(defineProps<Props>(), {
    height: '500px',
    mode: 'default',
    placeholder: '请输入内容...',
    excludeKeys: () => ['fontFamily']
  })

  const modelValue = defineModel<string>({ required: true })

  // 编辑器实例
  const editorRef = shallowRef<IDomEditor>()
  const userStore = useUserStore()

  // 常量配置
  const DEFAULT_UPLOAD_CONFIG = {
    maxFileSize: 3 * 1024 * 1024, // 3MB
    maxNumberOfFiles: 10,
    fieldName: 'file',
    allowedFileTypes: ['image/*']
  } as const

  // 计算属性：上传服务器地址
  // P9 Sprint 4 / W4.A.3：默认走 file 模块真 MinIO 上传端点（bizModule=editor），
  // 后端 file.controller @Post('upload') 校验：MIME image/* + 单文件 ≤ 5 MB（DEFAULT_UPLOAD_CONFIG）
  const uploadServer = computed(
    () => props.uploadConfig?.server || `${import.meta.env.VITE_API_URL ?? ''}/api/v1/file/upload`
  )

  // 合并上传配置
  const mergedUploadConfig = computed(() => ({
    ...DEFAULT_UPLOAD_CONFIG,
    ...props.uploadConfig
  }))

  // 工具栏配置
  const toolbarConfig = computed((): Partial<IToolbarConfig> => {
    const config: Partial<IToolbarConfig> = {}

    // 完全自定义工具栏
    if (props.toolbarKeys && props.toolbarKeys.length > 0) {
      config.toolbarKeys = props.toolbarKeys
    }

    // 插入新工具
    if (props.insertKeys) {
      config.insertKeys = props.insertKeys
    }

    // 排除工具
    if (props.excludeKeys && props.excludeKeys.length > 0) {
      config.excludeKeys = props.excludeKeys
    }

    return config
  })

  // 编辑器配置（不直接引用 hljs；hljs 在 onMounted 内通过 await import('highlight.js') 异步注入）
  const editorConfig: Partial<IEditorConfig> = {
    placeholder: props.placeholder,
    MENU_CONF: {
      uploadImage: {
        fieldName: mergedUploadConfig.value.fieldName,
        maxFileSize: mergedUploadConfig.value.maxFileSize,
        maxNumberOfFiles: mergedUploadConfig.value.maxNumberOfFiles,
        allowedFileTypes: mergedUploadConfig.value.allowedFileTypes,
        server: uploadServer.value,
        /* P9 Sprint 4 / W4.A.3：随上传 form 一起带 bizModule=editor + isPublic=true */
        meta: {
          bizModule: 'editor',
          isPublic: 'true'
        },
        metaWithUrl: false,
        headers: {
          Authorization: userStore.accessToken
        },
        /**
         * P9 Sprint 4 / W4.A.3：解析后端 ApiResponse 包裹的 FileUploadResultDto
         *   后端返回：{ code: 0, data: { fileNo, url, ...}, msg }
         *   wangEditor 期望：{ errno: 0, data: { url, alt?, href? } }
         */
        customInsert(res: unknown, insertFn: (url: string, alt?: string, href?: string) => void) {
          try {
            const r = res as { code?: number; data?: { url?: string }; msg?: string }
            if (r && r.code === 0 && r.data && typeof r.data.url === 'string') {
              insertFn(r.data.url, '', r.data.url)
              ElMessage.success(`图片上传成功 ${EmojiText[200]}`)
              return
            }
            ElMessage.error(`图片上传失败：${r?.msg ?? '响应格式异常'}`)
          } catch {
            ElMessage.error(`图片上传失败 ${EmojiText[500]}`)
          }
        },
        onError(file: File, err: unknown) {
          ElMessage.error(`图片上传失败：${(err as Error)?.message ?? EmojiText[500]}`)
        }
      },
      // 代码块菜单 — 语言列表延迟初始化（默认空，onMounted 中异步注入）
      codeSelectLang: {
        codeLangs: [] as Array<{ text: string; value: string }>
      }
    }
  }

  // 编辑器创建回调
  const onCreateEditor = (editor: IDomEditor) => {
    editorRef.value = editor

    // 监听全屏事件（占位：保留挂载点，便于后续埋点）
    editor.on('fullScreen', () => {
      // no-op
    })

    // 确保在编辑器创建后应用自定义图标
    applyCustomIcons()
  }

  // 应用自定义图标（带重试机制）
  const applyCustomIcons = () => {
    let retryCount = 0
    const maxRetries = 10
    const retryDelay = 100

    const tryApplyIcons = () => {
      const editor = editorRef.value
      if (!editor) {
        if (retryCount < maxRetries) {
          retryCount++
          setTimeout(tryApplyIcons, retryDelay)
        }
        return
      }

      // 获取当前编辑器的工具栏容器
      const editorContainer = editor.getEditableContainer().closest('.editor-wrapper')
      if (!editorContainer) {
        if (retryCount < maxRetries) {
          retryCount++
          setTimeout(tryApplyIcons, retryDelay)
        }
        return
      }

      const toolbar = editorContainer.querySelector('.w-e-toolbar')
      const toolbarButtons = editorContainer.querySelectorAll('.w-e-bar-item button[data-menu-key]')

      if (toolbar && toolbarButtons.length > 0) {
        return
      }

      // 如果工具栏还没渲染完成，继续重试
      if (retryCount < maxRetries) {
        retryCount++
        setTimeout(tryApplyIcons, retryDelay)
      } else {
        console.warn('工具栏渲染超时，无法应用自定义图标 - 编辑器实例:', editor.id)
      }
    }

    // 使用 requestAnimationFrame 确保在下一帧执行
    requestAnimationFrame(tryApplyIcons)
  }

  // 暴露编辑器实例和方法
  defineExpose({
    /** 获取编辑器实例 */
    getEditor: () => editorRef.value,
    /** 设置编辑器内容 */
    setHtml: (html: string) => editorRef.value?.setHtml(html),
    /** 获取编辑器内容 */
    getHtml: () => editorRef.value?.getHtml(),
    /** 清空编辑器 */
    clear: () => editorRef.value?.clear(),
    /** 聚焦编辑器 */
    focus: () => editorRef.value?.focus()
  })

  // 生命周期
  onMounted(async () => {
    // P9 Sprint 4 W4.D.4：highlight.js 改为异步 import，独立 chunk vendor-highlight-async
    // 不在顶部 import，避免被打包进首屏同步 chunk；只有挂载本组件时才下载 hljs。
    try {
      const hljsModule = await import('highlight.js')
      const hljs = hljsModule.default ?? hljsModule
      // 注入到 wangEditor 代码高亮菜单的语言列表（延迟可用）
      const codeLangs = [
        { text: 'JavaScript', value: 'javascript' },
        { text: 'TypeScript', value: 'typescript' },
        { text: 'HTML', value: 'html' },
        { text: 'CSS', value: 'css' },
        { text: 'JSON', value: 'json' },
        { text: 'Java', value: 'java' },
        { text: 'Python', value: 'python' },
        { text: 'Go', value: 'go' },
        { text: 'Shell', value: 'bash' }
      ]
      const menuConf = (editorConfig.MENU_CONF ?? {}) as Record<string, unknown>
      const codeMenu = (menuConf.codeSelectLang ?? {}) as { codeLangs?: typeof codeLangs }
      codeMenu.codeLangs = codeLangs
      menuConf.codeSelectLang = codeMenu
      editorConfig.MENU_CONF = menuConf as IEditorConfig['MENU_CONF']
      // 暴露到 window 供 wangEditor 内部代码块插件按需调用（保持向后兼容）
      ;(window as unknown as { hljs?: unknown }).hljs = hljs
    } catch (err) {
      console.warn('highlight.js 异步加载失败，代码高亮将降级为普通文本:', err)
    }
    // 图标替换已在 onCreateEditor 中处理
  })

  onBeforeUnmount(() => {
    const editor = editorRef.value
    if (editor) {
      editor.destroy()
    }
  })
</script>

<style lang="scss">
  @use './style';
</style>
