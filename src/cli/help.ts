// 帮助文案：命令总览与单个命令的详细说明。

import { APP_NAME } from '@/cli/constants';

const GENERAL_HELP = `Usage: workshop <command> [options]

Commands:
  gen                            生成随机名称并以表格输出
  list [sheets|places|candidates]
                                列出项目数据：设定卡 / 地名库 / 候选库（默认 sheets）
  add [<ID>]                     把名称写入角色库（--name 手动录入，或收录 gen 输出的 ID）
  open                           拉起 ${APP_NAME} 应用
  help [command]                 显示帮助或某个命令的详细说明
  completion [shell]             输出命令补全脚本（zsh / bash / fish）

生成参数（gen）：
  --race <族群>           人族 | 精灵族 | 妖鬼 | 混血
  --type <类型>           人名 | 地名
  --gender <性别>         不限 | 男性 | 女性 | 中性
  --weight <权重>         姓氏稀有倾向 0-1（0 = 按人口，1 = 极稀有）
  --count <数量>          生成数量 1-100

角色库参数（add）：
  --name <名称>           角色名称（与生成结果 ID 二选一）
  --race <族群>           角色族群
  --type <类型>           人名写入 candidates.md，地名写入 places.md
  --gender <性别>         角色性别
  --note <备注>           角色备注
  --favorite              标记为收藏
  --dir <目录>            项目目录；默认 当前目录

通用参数：
  --color / --no-color    始终 / 从不输出彩色（默认按终端自动判断）
  -h, --help              显示帮助
  --version               显示版本号

默认值：未显式指定的参数取自项目 preferences.md 中保存的生成规则；
        项目没有 preferences.md 时使用内置默认值。

示例：
  workshop gen                              生成名称（默认参数取自 preferences.md）
  workshop gen --race elf --count 20        生成 20 个精灵族名称
  workshop list                             列出设定卡（默认 sheets）
  workshop list candidates                  列出候选库
  workshop add --race human --name "云隐"   手动写入角色库
  workshop add <ID>                         收录 workshop gen 输出的结果`;

const COMMAND_HELP: Record<string, string> = {
  gen: `Usage: workshop gen [--race <族群>] [--type <类型>] [--gender <性别>]
             [--weight <权重>] [--count <数量>] [--dir <目录>]

生成随机名称并以表格输出；输出的第一列是 ID，可用 \`workshop add <ID>\` 收录。

Arguments:
  --race <族群>     人族 | 精灵族 | 妖鬼 | 混血
  --type <类型>     人名 | 地名
  --gender <性别>   不限（男女混合）| 男性 | 女性 | 中性
  --weight <权重>   姓氏稀有倾向 0-1：0 = 按人口，1 = 极稀有
  --count <数量>    生成数量 1-100
  --dir <目录>      项目目录；默认 当前目录

默认值取自项目 preferences.md 中保存的生成规则（没有 preferences.md 时用内置默认值）。

Examples:
  workshop gen
  workshop gen --race elf --gender female --count 20
  workshop gen --type place --weight 0.9`,
  list: `Usage: workshop list [sheets|places|candidates] [--dir <目录>]

读取项目目录下 .workshop 中的数据并以表格输出；数据目录不存在时直接报错。

Arguments:
  sheets            设定卡（.workshop/sheets.md，默认）
  places            地名库（.workshop/places.md）
  candidates        候选库（.workshop/candidates.md）
  --type <类型>     兼容旧用法：人名 → 候选库、地名 → 地名库
  --dir <目录>      项目目录；默认 当前目录

Examples:
  workshop list
  workshop list places
  workshop list candidates --dir ~/novels/star-sea`,
  add: `Usage: workshop add <ID> [--favorite] [--note <备注>] [--dir <目录>]
             [--name "<名称>"] [--race <族群>] [--type <类型>] [--gender <性别>]

把名称写入项目目录下 .workshop 的角色库；数据目录不存在时自动创建。

Arguments:
  <ID>              workshop gen 输出的结果 ID（从 .workshop/temp.md 中查找）
  --name <名称>     角色名称（与 ID 二选一）
  --race <族群>     人族 | 精灵族 | 妖鬼 | 混血
  --type <类型>     人名写入 candidates.md，地名写入 places.md
  --gender <性别>   不限（男女混合）| 男性 | 女性 | 中性
  --note <备注>     角色备注
  --favorite        标记为收藏
  --dir <目录>      项目目录；默认 当前目录

Examples:
  workshop add --race human --name "云隐"
  workshop add --race elf --gender female --name "希尔维" --note "精灵族女法师"
  workshop add a1b2c3_0`,
  open: `Usage: workshop open

后台拉起 ${APP_NAME} 桌面应用（仅 macOS）：应用已在运行时不会重复启动，也不会抢前台。

Examples:
  workshop open`,
  completion: `Usage: workshop completion [zsh|bash|fish]

输出当前 shell（或指定 shell）的命令补全脚本；安装时已自动注册，一般无需手动执行。

Examples:
  workshop completion zsh
  workshop completion bash >> ~/.bash_completion`,
  help: `Usage: workshop help [command]

显示命令总览，或某个命令的详细参数与示例。

Examples:
  workshop help
  workshop help gen`,
};

export function helpText(topic: string): string {
  const key = topic.trim().toLowerCase();
  if (!key) return GENERAL_HELP;
  const text = COMMAND_HELP[key];
  if (text) return text;
  if (key === 'generate') return COMMAND_HELP.gen;
  return `${GENERAL_HELP}\n\n未找到命令说明：${topic}`;
}
