# 每日规划助手

一个基于原生 HTML、CSS 和 JavaScript 的本地时间管理工具，用于记录每日任务、安排优先级、跟踪当前任务耗时，并查看完成率与历史数据。

项目无需构建步骤，直接打开 `planner.html` 即可使用。数据默认保存在浏览器 `localStorage` 中，也支持导出和导入 JSON 文件备份。

## 功能特性

- 添加、编辑、删除每日任务
- 按分组、优先级、日期和预估时长管理任务
- 支持每天重复任务
- 支持未完成任务顺延到下一天
- 支持拖拽排序任务
- 设置当前任务，并进行开始、暂停、继续、打回、完成操作
- 自动统计完成率、预估投入、实际耗时和耗时偏差
- 查看本周数据和往日历史数据
- 根据开始时间和休息设置生成智能排程分析
- 支持导出和导入完整数据 JSON
- 使用浏览器本地存储，无需后端服务

## 技术栈

- HTML5
- CSS3
- JavaScript
- [SortableJS](https://sortablejs.github.io/Sortable/)：用于任务拖拽排序

## 项目结构

```text
time_manager/
├── planner.html                  # 应用入口页面，包含主要界面与脚本逻辑
├── planner.css                   # 页面样式
├── planner.js                    # 早期拆分脚本文件，当前入口以 planner.html 内联脚本为准
└── README.md
```

## 本地运行

方式一：直接打开

1. 下载或克隆项目到本地。
2. 用浏览器打开 `planner.html`。

方式二：使用本地静态服务

```bash
python -m http.server 8000
```

然后访问：

```text
http://localhost:8000/planner.html
```

## 数据说明

应用数据会保存在当前浏览器的 `localStorage` 中，主要包含：

- `dailyPlanner.tasks`：任务数据
- `dailyPlanner.reviews`：复盘/历史数据
- `dailyPlanner.settings`：折叠状态、排序、顺延记录等设置

如果更换浏览器、清理浏览器数据或更换设备，本地数据可能丢失。建议定期点击页面右上角的“导出数据”按钮备份 JSON 文件。

## 导入与导出

导出数据：

1. 点击页面右上角“导出数据”。
2. 浏览器会下载形如 `planner-data-YYYY-MM-DD.json` 的文件。

导入数据：

1. 点击页面右上角“导入数据”。
2. 选择之前导出的 JSON 文件。
3. 导入成功后，页面会使用导入的数据重新渲染。

## 部署到 GitHub Pages

1. 将项目上传到 GitHub 仓库。
2. 进入仓库的 `Settings`。
3. 打开 `Pages`。
4. 在 `Build and deployment` 中选择：
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
5. 保存后等待 GitHub Pages 部署完成。

部署完成后，可以通过类似下面的地址访问：

```text
https://你的用户名.github.io/仓库名/planner.html
```

## 注意事项

- 项目通过 CDN 加载 SortableJS，首次访问时需要网络连接。
- 任务数据只保存在访问该页面的浏览器中，GitHub Pages 不会自动同步数据。
- 如果希望多人共享或跨设备同步，需要额外接入后端服务或云存储。
- 当前项目没有打包工具和依赖安装流程，适合直接作为静态网页托管。

## License

如果你计划开源，建议在仓库中补充 `LICENSE` 文件。常见选择包括 MIT License。
