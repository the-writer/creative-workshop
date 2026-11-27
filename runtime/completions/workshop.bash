# Creation Workshop 命令行工具补全（bash）。
# 安装脚本会把本文件复制到 /usr/local/etc/bash_completion.d/workshop。

_workshop_completion() {
  local cur prev commands options
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  commands="gen list add open help completion"
  options="--race --type --gender --weight --count --name --note --favorite --dir --list --add --color --no-color --help --version"

  case "$prev" in
    --race|--族群)
      COMPREPLY=($(compgen -W "human elf yaogui mixed 人族 精灵族 妖鬼 混血" -- "$cur"))
      return
      ;;
    --type|--类型)
      COMPREPLY=($(compgen -W "person place 人名 地名" -- "$cur"))
      return
      ;;
    --gender|--性别)
      COMPREPLY=($(compgen -W "any male female neutral 不限 男性 女性 中性" -- "$cur"))
      return
      ;;
    list)
      COMPREPLY=($(compgen -W "sheets places candidates" -- "$cur"))
      return
      ;;
    completion)
      COMPREPLY=($(compgen -W "zsh bash fish" -- "$cur"))
      return
      ;;
    help)
      COMPREPLY=($(compgen -W "$commands" -- "$cur"))
      return
      ;;
  esac

  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "$options" -- "$cur"))
  else
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
  fi
}

complete -F _workshop_completion workshop
