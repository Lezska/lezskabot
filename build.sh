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
git clone https://github.com/Lezska/pjskcards.git
mv pjskcards cards
echo "-----pjskcards Done-----"