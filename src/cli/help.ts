// 帮助文案：命令总览与单个命令的详细说明。

import { APP_NAME } from '@/cli/constants';

const GENERAL_HELP = `Usage: workshop [command] [options]

Commands:
  gen                     生成随机名称并以表格输出（默认命令）
  list                    列出当前目录 .workshop 中的角色数据（等同于 --list）
  add                     把角色写入当前目录 .workshop 的角色库（等同于 --add）
  open                    拉起 ${APP_NAME} 应用
  help [command]          显示帮助或某个命令的详细说明

生成参数（gen）：
  --race <族群>           人族 | 精灵族 | 妖鬼 | 混血；默认 人族
  --type <类型>           人名 | 地名；默认 人名
  --gender <性别>         不限 | 男性 | 女性 | 中性；默认 不限（男女混合）
  --weight <权重>         姓氏稀有倾向 0-1（0 = 按人口，1 = 极稀有）；默认 0.6
  --count <数量>          生成数量 1-100；默认 10

角色库参数（list / add）：
  --list                  读取当前目录 .workshop 并列出角色数据
  --add                   把角色添加到当前目录 .workshop 的角色库
  --name <名称>           角色名称（--add 必填）
  --race <族群>           角色族群；默认 人族
  --type <类型>           人名写入 candidates.md，地名写入 places.md；默认 人名
  --gender <性别>         角色性别；默认 不限
  --note <备注>           角色备注
  --favorite              标记为收藏
  --dir <目录>            项目目录；默认 当前目录

通用参数：
  --color / --no-color    始终 / 从不输出彩色（默认按终端自动判断）
  -h, --help              显示帮助
  --version               显示版本号

示例：
  workshop                                  生成 10 个人族人名
  workshop --race elf --count 20            生成 20 个精灵族人名
  workshop --type place --weight 0.9        生成偏稀有的地名
  workshop --list                           列出当前目录的角色库
  workshop --add --race human --name "云隐"  把角色写入角色库`;

const COMMAND_HELP: Record<string, string> = {
  gen: `Usage: workshop gen [--race <族群>] [--type <类型>] [--gender <性别>]
             [--weight <权重>] [--count <数量>]

生成随机名称并以表格输出；不带参数时等同于直接运行 workshop。

Arguments:
  --race <族群>     人族 | 精灵族 | 妖鬼 | 混血；默认 人族
  --type <类型>     人名 | 地名；默认 人名
  --gender <性别>   不限（男女混合）| 男性 | 女性 | 中性；默认 不限
  --weight <权重>   姓氏稀有倾向 0-1：0 = 按人口，1 = 极稀有；默认 0.6
  --count <数量>    生成数量 1-100；默认 10

Examples:
  workshop gen
  workshop gen --race elf --gender female --count 20
  workshop gen --type place --weight 0.9`,
  list: `Usage: workshop list [--type <类型>] [--dir <目录>]

读取项目目录下 .workshop 中的角色数据并以表格输出；目录不存在时直接报错。

Arguments:
  --type <类型>     人名读取 candidates.md，地名读取 places.md；默认 人名
  --dir <目录>      项目目录；默认 当前目录

Examples:
  workshop list
  workshop list --type place
  workshop list --dir ~/novels/star-sea`,
  add: `Usage: workshop add --name "<名称>" [--race <族群>] [--type <类型>]
             [--gender <性别>] [--note <备注>] [--favorite] [--dir <目录>]

把角色写入项目目录下 .workshop 的角色库；目录不存在时自动创建。

Arguments:
  --name <名称>     角色名称（必填）
  --race <族群>     人族 | 精灵族 | 妖鬼 | 混血；默认 人族
  --type <类型>     人名写入 candidates.md，地名写入 places.md；默认 人名
  --gender <性别>   不限（男女混合）| 男性 | 女性 | 中性；默认 不限
  --note <备注>     角色备注
  --favorite        标记为收藏
  --dir <目录>      项目目录；默认 当前目录

Examples:
  workshop add --race human --name "云隐"
  workshop add --race elf --gender female --name "希尔维" --note "精灵族女法师"
  workshop add --type place --name "青云城" --dir ~/novels/star-sea`,
  open: `Usage: workshop open

拉起 ${APP_NAME} 桌面应用（仅 macOS）；应用已在运行时直接切到前台。

Examples:
  workshop open`,
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
