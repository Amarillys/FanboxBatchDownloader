// ==UserScript==
// @name         Fanbox Batch Downloader
// @namespace    http://tampermonkey.net/
// @version      0.60
// @description  Batch Download on creator, not post
// @author       https://github.com/amarillys
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.2.2/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.6/dat.gui.min.js
// @match        https://www.pixiv.net/fanbox/creator/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-end
// @license      MIT
// ==/UserScript==

/**
 * Update Log
 *  > 200224
 *    More beautiful! UI Redesigned. --use dat.gui,
 *    Performence Improved. -- multi-thread supported.
 *  > 200222
 *    Bug Fixed - Psd files download failure <Change download type from blob to arraybuffer, which cause low performence>
 *    Bug Fixed - Display incorrect on partial download
 *  > 200222
 *    Bug Fixed - Post with '/' cause deep path in zip
 *  > 200102
 *    Bug Fixed - Caused by empty cover
 *  > 191228
 *    Bug Fixed
 *    Correct filenames
 *  > 191227
 *    Code Reconstruct
 *    Support downloading of artice
 *    Correct filenames
 *
 *    // 中文注释
 *    代码重构
 *    新增对文章的下载支持
 *  > 200222
 *    偷懒，以后不加中文注释
 *  > 191226
 *    Support downloading by batch(default: 100 files per batch)
 *    Support donwloading by specific index
 *    // 中文注释
 *    新增支持分批下载的功能（默认100个文件一个批次）
 *    新增支持按索引下载的功能
 *
 *  > 191223
 *    Add support of files
 *    Improve the detect of file extension
 *    Change Download Request as await, for avoiding delaying.
 *    Add manual package while click button use middle button of mouse
 *    // 中文注释
 *    增加对附件下载的支持
 *    优化文件后缀名识别
 *    修改下载方式为按顺序下载，避免超时
 *    增加当鼠标中键点击时手动打包
 **/

/* global JSZip GM_xmlhttpRequest */
;(function() {
  'use strict'

  // set style
  GM_addStyle(`
    .dg.main{
      top: 16px;
      position: fixed;
      left: 20%;
      filter: drop-shadow(2px 4px 6px black);
      opacity: 0.8;
      z-index: 999;
    }
    li.cr.number.has-slider:nth-child(2) {
      pointer-events: none;
    }
    .slider-fg {
      transition: width 0.8s ease-out;
    }
  `)

  window = unsafeWindow
  class ThreadPool {
    constructor(poolSize) {
      this.size = poolSize || 20
      this.running = 0
      this.waittingTasks = []
      this.callback = []
      this.tasks = []
      this.counter = 0
      this.sum = 0
      this.finished = false
      this.errorLog = ''
      this.step = () => {}
      this.timer = null
      this.callback.push(() =>
        console.log(this.errorLog)
      )
    }

    status() {
      return ((this.counter / this.sum) * 100).toFixed(1) + '%'
    }

    run() {
      if (this.finished) return
      if (this.waittingTasks.length === 0)
        if (this.running <= 0) {
          for (let m = 0; m < this.callback.length; ++m)
            this.callback[m] && this.callback[m]()
          this.finished = true
        } else return

      while (this.running < this.size) {
        if (this.waittingTasks.length === 0) return
        let curTask = this.waittingTasks[0]
        curTask.do().then(
          onSucceed => {
            this.running--
            this.counter++
            this.step()
            this.run()
            typeof onSucceed === 'function' && onSucceed()
          },
          onFailed => {
            this.errorLog += onFailed + '\n'
            this.running--
            this.counter++
            this.step()
            this.run()
            curTask.err()
          }
        )
        this.waittingTasks.splice(0, 1)
        this.tasks.push(this.waittingTasks[0])
        this.running++
      }
    }

    add(fn, errFn) {
      this.waittingTasks.push({ do: fn, err: errFn || (() => {}) })
      this.sum++
      clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.run()
        clearTimeout(this.timer)
      }, this.autoStartTime)
    }

    setAutoStart(time) {
      this.autoStartTime = time
    }

    finish(callback) {
      this.callback.push(callback)
    }

    isFinished() {
      return this.finished
    }
  }

  class Zip {
    constructor(title) {
      this.title = title
      this.zip = new JSZip()
      this.size = 0
      this.partIndex = 0
    }
    file(filename, blob) {
      this.zip.file(filename, blob, {
        compression: 'STORE'
      })
      this.size += blob.size
    }
    add(folder, name, blob) {
      if (this.size + blob.size >= Zip.MAX_SIZE) {
        let index = this.partIndex
        this.zip
          .generateAsync({
            type: 'blob'
          })
          .then(zipBlob => saveBlob(zipBlob, `${this.title}-${index}.zip`))
        this.partIndex++
        this.zip = new JSZip()
        this.size = 0
      }
      this.zip.folder(folder).file(name, blob, {
        compression: 'STORE'
      })
      this.size += blob.size
    }
    pack() {
      if (this.size === 0) return
      let index = this.partIndex
      this.zip
        .generateAsync({
          type: 'blob'
        })
        .then(zipBlob => saveBlob(zipBlob, `${this.title}-${index}.zip`))
      this.partIndex++
      this.zip = new JSZip()
      this.size = 0
    }
  }
  Zip.MAX_SIZE = 1048576000

  const creatorId = parseInt(document.URL.split('/')[5])
  let creatorInfo = null
  let options = {
    start: 1,
    end: 1,
    thread: 6,
    batch: 200,
    progress: 0,
    speed: 0
  }

  const Text = {
    batch: '分批 / Batch',
    download: '点击这里下载',
    download_en: 'Click to Download',
    init: '初始化中...',
    init_en: 'Initilizing...',
    initFinished: '初始化完成',
    initFinished_en: 'Initilized',
    start: '起始 / start',
    end: '结束 / end',
    thread: '线程 / threads',
    pack: '手动打包(不推荐)',
    pack_en: 'manual pack(Not Rcm)',
    progress: '进度 / Progress',
    speed: '网速 / speed'
  }

  const clickHandler = {
    init() {},
    download: () => {
      console.log('startDownloading')
      downloadByFanboxId(creatorInfo, creatorId)
    },
    pack() {
      zip.pack()
    }
  }
  const EN_FIX = navigator.language.indexOf('zh') > -1 ? '' : '_en'

  const gui = new dat.GUI({
    autoPlace: false,
    useLocalStorage: false
  })
  let initText = gui.add(clickHandler, 'init').name(Text['init' + EN_FIX])
  let progressCtl = null

  let init = async () => {
    let base = unsafeWindow.document.querySelector('#root')

    base.appendChild(gui.domElement)
    uiInited = true

    creatorInfo = await getAllPostsByFanboxId(creatorId)
    initText.name(Text['initFinished' + EN_FIX])

    // init dat gui
    const sum = creatorInfo.posts.length
    progressCtl =  gui.add(options, 'progress', 0, 100, 1).name(Text['progress'])
    const startCtl = gui.add(options, 'start', 1, sum, 1).name(Text['start'])
    const endCtl = gui.add(options, 'end', 1, sum, 1).name(Text['end'])
    endCtl.setValue(sum)
    gui.add(options, 'thread', 1, 20, 1).name(Text['thread'])
    gui.add(options, 'batch', 10, 5000, 10).name(Text['batch'])
    gui.add(clickHandler, 'download').name(Text['download' + EN_FIX])
    gui.add(clickHandler, 'pack').name(Text['pack' + EN_FIX])

    startCtl.onChange(() => {
      if (options.start > options.end)
        options.start = options.end
    })
    endCtl.onChange(() => {
      if (options.end < options.start)
        options.end = options.start
    })

    gui.open()
  }

  // init global values
  let zip = null
  let amount = 0
  let pool = null
  let uiInited = false
  const fetchOptions = {
    credentials: 'include',
    headers: {
      Accept: 'application/json, text/plain, */*'
    }
  }
  window.onload = () => {
    init()
    let timer = setInterval(() => {
      if (!uiInited && document.querySelector('.dg.main') === null)
        init()
      else clearInterval(timer)
    }, 3000)
  }

  function gmRequireImage(url) {
    return new Promise((resolve, reject) =>
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        overrideMimeType: 'application/octet-stream',
        responseType: 'blob',
        asynchrouns: true,
        onload: res => resolve(res.response),
        onprogress: res => console.log(`${res.done} / ${res.total}, ${new Date().getTime()}`),
        onerror: () =>
          GM_xmlhttpRequest({
            method: 'GET',
            url,
            overrideMimeType: 'application/octet-stream',
            responseType: 'arraybuffer',
            onload: res => resolve(new Blob([res.response])),
            onerror: res => reject(res)
          })
      })
    )
  }

  async function downloadByFanboxId(creatorInfo, creatorId) {
    let processed = 0
    gui.remove(initText)
    progressCtl.setValue(0)
    let { batch, end, start, thread } = options
    options.progress = 0
    zip = new Zip(`${creatorId}-${creatorInfo.name}-${start + 1}-${end}`)
    let stepped = 0
    if (creatorInfo.cover)
      zip.file('cover.jpg', await gmRequireImage(creatorInfo.cover))

    // init pool
    pool = new ThreadPool(thread)
    pool.finish(() => {
      zip.pack()
    })

    // start downloading
    for (let i = start, p = creatorInfo.posts; i < end; ++i) {
      let folder = `${p[i].title.replace(/\//g, '-')}-${p[i].id}`
      if (!p[i].body) continue
      let { blocks, imageMap, fileMap, files, images } = p[i].body
      let picIndex = 0
      let imageList = []
      let fileList = []

      if (p[i].type === 'article') {
        let article = `# ${p[i].title}\n`
        for (let j = 0; j < blocks.length; ++j) {
          switch (blocks[j].type) {
            case 'p': {
              article += `${blocks[j].text}\n\n`
              break
            }
            case 'image': {
              picIndex++
              let image = imageMap[blocks[j].imageId]
              imageList.push(image)
              article += `![${p[i].title} - P${picIndex}](${folder}_${j}.${image.extension})\n\n`
              break
            }
            case 'file': {
              let file = fileMap[blocks[j].fileId]
              fileList.push(file)
              article += `[${p[i].title} - ${file.name}](${creatorId}-${folder}-${file.name}.${file.extension})\n\n`
              break
            }
          }
        }

        zip.add(folder, 'article.md', new Blob([article]))
        for (let j = 0; j < imageList.length; ++j) {
          let image = imageList[j]
          amount++
          pool.add(() => new Promise((resolve, reject) => {
            gmRequireImage(image.originalUrl).then(blob => {
              processed++
              zip.add(folder, `${folder}_${j}.${image.extension}`, blob)
              stepped++
              resolve()
            }).catch(() => {
              console.log(`Failed to download: ${image.originalUrl}`)
              reject()
            })
          }))
        }
        for (let j = 0; j < fileList.length; ++j) {
          let file = fileList[j]
          amount++
          pool.add(() => new Promise((resolve, reject) => {
            gmRequireImage(file.url).then(blob => {
              processed++
              saveBlob(blob, `${creatorId}-${folder}_${j}-${file.name}.${file.extension}`)
              stepped++
              resolve()
            }).catch(() => {
              console.log(`Failed to download: ${file.url}`)
              reject()
            })
          }))
        }
      }

      if (files) {
        for (let j = 0; j < files.length; ++j) {
          let file = files[j]
          amount++
          pool.add(() => new Promise((resolve, reject) => {
            gmRequireImage(file.url).then(blob => {
              processed++
              if (blob.size < 51200000)
                zip.add(folder, `${file.name}.${file.extension}`)
              else
                saveBlob(blob, `${folder}-${creatorInfo.name}-${folder}_${j}.${file.extension}`)
              stepped++
              resolve()
            }).catch(() => {
              console.log(`Failed to download: ${file.url}`)
              reject()
            })
          }))
        }
      }
      if (images) {
        for (let j = 0; j < images.length; ++j) {
          let image = images[j]
          amount++
          pool.add(() => new Promise((resolve, reject) => {
            gmRequireImage(image.originalUrl).then(blob => {
              processed++
              zip.add(folder, `${folder}_${j}.${image.extension}`, blob)
              stepped++
              resolve()
            }).catch(() => {
              console.log(`Failed to download: ${image.url}`)
              reject()
            })
          }))
        }
      }
    }
    
    pool.step = () => {
      progressCtl.setValue(processed / amount * 100)
      console.log(` Progress: ${processed} / ${amount}, Pool: ${pool.running} @ ${pool.sum}`)
      if (stepped >= batch) {
        zip.pack()
        stepped = 0
      }
    }
  }

  async function getAllPostsByFanboxId(creatorId) {
    let fristUrl = `https://www.pixiv.net/ajax/fanbox/creator?userId=${creatorId}`
    let creatorInfo = {
      cover: null,
      posts: []
    }
    let firstData = await (await fetch(fristUrl, fetchOptions)).json()
    let body = firstData.body
    creatorInfo.cover = body.creator.coverImageUrl
    creatorInfo.name = body.creator.user.name
    creatorInfo.posts.push(...body.post.items.filter(p => p.body))
    let nextPageUrl = body.post.nextUrl
    while (nextPageUrl) {
      let nextData = await (await fetch(nextPageUrl, fetchOptions)).json()
      creatorInfo.posts.push(...nextData.body.items.filter(p => p.body))
      nextPageUrl = nextData.body.nextUrl
    }
    return creatorInfo
  }

  function saveBlob(blob, fileName) {
    let downloadDom = document.createElement('a')
    document.body.appendChild(downloadDom)
    downloadDom.style = `display: none`
    let url = window.URL.createObjectURL(blob)
    downloadDom.href = url
    downloadDom.download = fileName
    downloadDom.click()
    window.URL.revokeObjectURL(url)
  }
})()
