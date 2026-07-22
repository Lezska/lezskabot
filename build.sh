#!/bin/bash

echo "-----Building LLOne-----"
mkdir llone
mv LLBot-CLI-linux-x64.zip llone/
unzip llone/LLBot-CLI-linux-x64.zip
chmod +x llone/start.sh
echo "-----LLOne Done-----"
echo ""

echo "-----Building AstrBot-----"
git clone https://github.com/AstrBotDevs/AstrBot
cd AstrBot/
python3 -m venv ./venv
source venv/bin/activate
python -m pip install -r requirements.txt
cd ..
deactivate
echo "-----AstrBot Done-----"
echo ""

echo "-----Fetching pjskcards-----"
# 目录名固定 pjskcards（gacha-bot 插件默认读 /root/lezskabot/pjskcards）
git clone https://github.com/Lezska/pjskcards.git
echo "-----Cleaning pjskcards/.git-----"
# 部署只需要图片文件，不要 git 历史（pack 约 4GB，省磁盘）
# 用户不再需要从 pjskcards 仓库拉更新，如需更新直接 rm -rf pjskcards && 重跑 build.sh
rm -rf pjskcards/.git
echo "-----pjskcards Done-----"
