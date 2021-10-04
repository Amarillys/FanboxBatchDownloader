### V0.700 - 211004

#### Feature

+ Add support for embed external link.

  #### Bug Fixed

  + Fix a bug that the STORE compression method not works.
  + Fix a bug that the article's image id doesn't match.
  + Fix a bug that miss audio files in article.
  + Fix a bug when the creator doesn't have a cover.

#### Other

  + Move the update log to a individual file.



### 210719
  Fix some logic error.

### 210301
  Move id behind title in folder name.

### 210216
  Add semi-custom name function.

### 200514
  Decrease the pack size to avoid the stack overflow.

### 200429
  Bug Fixed!

### 200427
  Adapt to new Fanbox Change!
  Add post id to folder name!

### 200328
  Improve file naming
  Fix bugs that may cause files being skipped
  Add text if exist in post

### 200226
  Adapt to new Api! Add Error Tip!
  More frequentyle progress bar!
  More clearly status!

### 200224
  More beautiful! UI Redesigned. --use dat.gui,
  Performence Improved. -- multi-thread supported.

### 200222
  Bug Fixed - Psd files download failure <Change download type from blob to arraybuffer, which cause low performence###
  Bug Fixed - Display incorrect on partial download
### 200222
  Bug Fixed - Post with '/' cause deep path in zip
### 200102
  Bug Fixed - Caused by empty cover
### 191228
  Bug Fixed
  Correct filenames
### 191227
  Code Reconstruct
  Support downloading of artice
  Correct filenames
 *
  // 中文注释
  代码重构
  新增对文章的下载支持

### 200222
  偷懒，以后不加中文注释

### 191226
  Support downloading by batch(default: 100 files per batch)
  Support donwloading by specific index
  // 中文注释
  新增支持分批下载的功能（默认100个文件一个批次）
  新增支持按索引下载的功能

### 191223
  Add support of files
  Improve the detect of file extension
  Change Download Request as await, for avoiding delaying.
  Add manual package while click button use middle button of mouse
  // 中文注释
  增加对附件下载的支持
  优化文件后缀名识别
  修改下载方式为按顺序下载，避免超时
  增加当鼠标中键点击时手动打包