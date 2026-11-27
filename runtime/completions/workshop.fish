# Creation Workshop 命令行工具补全（fish）。
# 安装脚本会把本文件复制到 ~/.config/fish/completions/workshop.fish。

complete -c workshop -f

complete -c workshop -n '__fish_use_subcommand' -a gen -d '生成随机名称并以表格输出'
complete -c workshop -n '__fish_use_subcommand' -a list -d '列出项目数据（sheets/places/candidates）'
complete -c workshop -n '__fish_use_subcommand' -a add -d '把名称写入角色库'
complete -c workshop -n '__fish_use_subcommand' -a open -d '后台拉起桌面应用'
complete -c workshop -n '__fish_use_subcommand' -a help -d '显示帮助'
complete -c workshop -n '__fish_use_subcommand' -a completion -d '输出命令补全脚本'

complete -c workshop -l race -d '族群' -x -a 'human elf yaogui mixed 人族 精灵族 妖鬼 混血'
complete -c workshop -l type -d '类型' -x -a 'person place 人名 地名'
complete -c workshop -l gender -d '性别' -x -a 'any male female neutral 不限 男性 女性 中性'
complete -c workshop -l weight -d '姓氏稀有倾向 0-1'
complete -c workshop -l count -d '生成数量'
complete -c workshop -l name -d '名称'
complete -c workshop -l note -d '备注'
complete -c workshop -l favorite -d '标记为收藏'
complete -c workshop -l dir -d '项目目录' -x
complete -c workshop -l list -d '列出项目数据' -x -a 'sheets places candidates'
complete -c workshop -l add -d '写入角色库'
complete -c workshop -l color -d '始终输出彩色'
complete -c workshop -l no-color -d '从不输出彩色'
complete -c workshop -s h -l help -d '显示帮助'
complete -c workshop -l version -d '显示版本号'
