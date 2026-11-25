const rows = `
Move|Mover|Déplacer|移動|移动
Look|Mirar|Regarder|視点|视角
Attack|Atacar|Attaquer|攻撃|攻击
Smash|Aplastar|Écraser|破壊|粉碎
Grab|Agarrar|Saisir|つかむ|擒抱
Kick|Patada|Coup de pied|キック|踢击
Run|Correr|Courir|走る|奔跑
Block|Bloquear|Bloquer|ガード|防御
Taunt|Provocar|Provoquer|挑発|挑衅
Lock|Fijar|Verrouiller|ロックオン|锁定
Melee|Cuerpo a cuerpo|Corps à corps|近接攻撃|近战
Melee Smash|Golpe cuerpo a cuerpo|Frappe de mêlée|近接攻撃|近战猛击
Stomp|Pisotón|Piétinement|踏みつけ|踩踏
Stomp Shockwave|Onda de pisotón|Onde de piétinement|踏みつけ衝撃波|踩踏冲击波
Beam|Rayo|Rayon|ビーム|光束
Breath|Aliento|Souffle|ブレス|吐息
Roar|Rugido|Rugissement|咆哮|咆哮
Charge|Carga|Charge|突進|冲锋
Sprint|Esprintar|Sprinter|ダッシュ|冲刺
Pause|Pausa|Pause|一時停止|暂停
Ultimate|Definitiva|Ultime|アルティメット|终极技能
Ultimate (full rage)|Definitiva (furia llena)|Ultime (rage pleine)|アルティメット（怒り最大）|终极技能（怒气满时）
Powers|Poderes|Pouvoirs|パワー|技能
Power|Poder|Pouvoir|パワー|技能
Health|Salud|Santé|体力|生命值
Speed|Velocidad|Vitesse|移動速度|速度
HP|PV|PV|体力|生命
Rage|Furia|Rage|怒り|怒气
Wave|Oleada|Vague|ウェーブ|波次
Razed|Arrasados|Rasés|破壊|已摧毁
Buildings|Edificios|Bâtiments|建物|建筑
Tanks|Tanques|Chars|戦車|坦克
Helicopters|Helicópteros|Hélicoptères|ヘリコプター|直升机
Civilians|Civiles|Civils|市民|平民
Military|Ejército|Armée|軍勢|军队
Survive|Sobrevive|Survivre|生き残れ|存活
Destroy|Destruye|Détruire|破壊|摧毁
Crush|Aplasta|Écraser|踏みつぶせ|碾碎
Collect|Recoge|Ramasser|収集|收集
Objective complete|Objetivo completado|Objectif accompli|目標達成|目标完成
Rampage|Furia destructiva|Carnage|大暴れ|暴走
Landmark destroyed|Monumento destruido|Monument détruit|ランドマーク破壊|地标已摧毁
Danger|Peligro|Danger|危険|危险
Momentum|Impulso|Élan|勢い|气势
Stamina|Resistencia|Endurance|スタミナ|耐力
Champion|Campeón|Champion|王者|冠军
Challenger|Aspirante|Challenger|挑戦者|挑战者
The champion|El campeón|Le champion|王者|冠军
The challenger|El aspirante|Le challenger|挑戦者|挑战者
Heavyweight|Peso pesado|Poids lourds|ヘビー級|重量级
Heavyweight title|Título de peso pesado|Titre poids lourds|ヘビー級王座|重量级冠军
Fight!|¡Lucha!|Combattez !|ファイト！|开战！
Reversal!|¡Reversión!|Contre !|切り返し！|反制！
Suplex!|¡Suplex!|Souplesse !|スープレックス！|过肩摔！
One!|¡Uno!|Un !|ワン！|一！
Two!|¡Dos!|Deux !|ツー！|二！
Three!|¡Tres!|Trois !|スリー！|三！
Kick out!|¡Escapa!|Dégagez-vous !|キックアウト！|挣脱压制！
Break free!|¡Libérate!|Libérez-vous !|抜け出せ！|挣脱！
Get up|Levántate|Relevez-vous|立ち上がれ|起身
Mash|Pulsa repetidamente|Appuyez vite|連打|连按
Slam|Azotar|Écrasement|スラム|重摔
Pin|Inmovilizar|Immobiliser|フォール|压制
Pick up|Levantar|Relever|引き起こす|举起
Pinfall|Inmovilización|Tombé|フォール|压制获胜
Skip|Saltar|Passer|スキップ|跳过
Hold|Mantén|Maintenir|長押し|按住
Tap|Toca|Appuyer|タップ|点按
Strike|Golpe|Frappe|打撃|打击
Heavy|Golpe fuerte|Frappe lourde|強攻撃|重击
Finisher|Remate|Prise finale|フィニッシャー|终结技
Reverse|Revertir|Contrer|切り返す|反制
Counter|Contraatacar|Contre-attaque|カウンター|反击
Fire up!|¡Motívate!|Déchaînez-vous !|奮い立て！|振奋起来！
Full|Lleno|Plein|最大|已满
Ready|Listo|Prêt|準備完了|就绪
Ready!|¡Listo!|Prêt !|準備完了！|就绪！
Hold to pin · Tap to pick up|Mantén para inmovilizar · Toca para levantar|Maintenir pour immobiliser · Appuyer pour relever|長押しでフォール · タップで引き起こす|按住压制 · 点按举起
Escape · Mash / Reverse|Escapa · Pulsa rápido / Revierte|Échapper · Appuyer vite / Contrer|脱出 · 連打 / 切り返し|挣脱 · 连按 / 反制
Move + strike to throw · Grab to slam|Mueve + golpea para lanzar · Agarra para azotar|Direction + frappe pour projeter · Saisir pour écraser|移動＋打撃で投げ · つかむでスラム|方向＋打击投掷 · 擒抱重摔
Skip entrances|Saltar entradas|Passer les entrées|入場をスキップ|跳过入场
Knocked out|Noqueado|K.-O.|ノックアウト|已被击倒
Reconnect the missing controller to resume|Reconecta el mando para reanudar|Reconnectez la manette pour reprendre|コントローラーを再接続して再開|重新连接手柄以继续
Controller disconnected|Mando desconectado|Manette déconnectée|コントローラーが切断されました|手柄已断开
Reconnect to resume|Reconecta para reanudar|Reconnectez pour reprendre|再接続して再開|重新连接以继续
Connect two controllers and press a button on each before starting.|Conecta dos mandos y pulsa un botón en cada uno antes de empezar.|Connectez deux manettes et appuyez sur un bouton de chacune avant de commencer.|開始前にコントローラー2台を接続し、それぞれのボタンを押してください。|开始前连接两个手柄，并分别按下一个按钮。
Connect a controller and press a button on it before starting.|Conecta un mando y pulsa un botón antes de empezar.|Connectez une manette et appuyez sur un bouton avant de commencer.|開始前にコントローラーを接続し、ボタンを押してください。|开始前连接一个手柄并按下一个按钮。
Choose a supported local control layout.|Elige una configuración de controles compatible.|Choisissez des commandes locales compatibles.|対応するローカル操作を選んでください。|请选择支持的本地操作配置。
Grab a standing opponent, then strike for a move. Grab a downed opponent to pin. Mash your strike / grab / power buttons to escape a pin or grapple. ESC pauses either seat.|Agarra a un rival de pie y golpea para hacer una técnica. Agarra a uno caído para inmovilizar. Pulsa repetidamente golpe / agarre / poderes para escapar. ESC pausa para ambos.|Saisissez un rival debout, puis frappez pour une prise. Saisissez un rival à terre pour l’immobiliser. Appuyez vite sur frappe / saisie / pouvoirs pour vous libérer. ESC met en pause.|立っている相手をつかみ、打撃で技を出します。倒れた相手をつかむとフォール。打撃・つかむ・パワーを連打して脱出。ESCで一時停止。|擒抱站立的对手后按打击施展招式；擒抱倒地的对手进行压制。连按打击、擒抱或技能键挣脱。ESC可为双方暂停。
Seven matches. One undisputed champion.|Siete combates. Un campeón indiscutible.|Sept combats. Un champion incontesté.|7試合。唯一の絶対王者。|七场比赛，一位无可争议的冠军。
Your contender|Tu aspirante|Votre challenger|あなたの挑戦者|你的挑战者
Contender|Aspirante|Challenger|挑戦者|挑战者
Route|Ruta|Parcours|ルート|路线
Six city belts. One world title. Each fighter has a separate tour in your player profile.|Seis cinturones urbanos. Un título mundial. Cada luchador tiene su propia gira en tu perfil.|Six ceintures. Un titre mondial. Chaque combattant a son propre circuit dans votre profil.|6都市のベルト、1つの世界王座。ファイターごとにツアーをプロフィールに保存。|六条城市腰带，一个世界冠军头衔。每位斗士的巡回赛进度单独保存在玩家档案中。
Each kaiju has its own saved tour.|Cada kaiju tiene su gira guardada.|Chaque kaiju possède son circuit enregistré.|怪獣ごとにツアーを保存します。|每只怪兽都有独立保存的巡回赛进度。
The road to the world title|El camino al título mundial|La route vers le titre mondial|世界王座への道|通往世界冠军之路
Best of three|Al mejor de tres|Deux tombés gagnants|2本先取|三局两胜
Falls count anywhere|Las caídas cuentan en cualquier lugar|Tombés partout|どこでもフォール有効|任何地点均可压制
Rival pressure|Presión rival|Pression adverse|対戦相手の強さ|对手强度
World champion|Campeón mundial|Champion du monde|世界王者|世界冠军
World title contender|Aspirante al título mundial|Challenger mondial|世界王座挑戦者|世界冠军挑战者
World heavyweight title|Título mundial de peso pesado|Titre mondial poids lourds|世界ヘビー級王座|世界重量级冠军
World championship|Campeonato mundial|Championnat du monde|世界選手権|世界冠军赛
Undisputed world champion|Campeón mundial indiscutible|Champion du monde incontesté|絶対世界王者|无可争议的世界冠军
The tour is yours|La gira es tuya|Le circuit est à vous|ツアーを制覇|巡回赛属于你
The final showdown|El enfrentamiento final|L’affrontement final|最終決戦|最终对决
Belt won|Cinturón ganado|Ceinture remportée|ベルト獲得|已获得腰带
✓ Belt won|✓ Cinturón ganado|✓ Ceinture remportée|✓ ベルト獲得|✓ 已获得腰带
Up next|A continuación|À suivre|次の試合|下一场
Win two falls to earn the belt|Gana dos caídas para obtener el cinturón|Gagnez deux tombés pour la ceinture|2本取ってベルトを獲得|赢得两局以获得腰带
Win the previous city title to unlock|Gana el título anterior para desbloquear|Gagnez le titre précédent pour débloquer|前の都市で王座を獲得して解放|赢得上一座城市的冠军以解锁
Unlocked · Your world title shot is ready|Desbloqueado · Puedes disputar el título mundial|Débloqué · Le titre mondial vous attend|解放済み · 世界王座に挑戦可能|已解锁 · 可以挑战世界冠军
View title route →|Ver ruta al título →|Voir le parcours →|王座への道を見る →|查看冠军路线 →
Return to match|Volver al combate|Retour au combat|試合に戻る|返回比赛
Back to contenders|Volver a aspirantes|Retour aux challengers|挑戦者選択に戻る|返回挑战者选择
Retry|Reintentar|Réessayer|再挑戦|重试
Replay|Volver a jugar|Rejouer|再プレイ|重玩
Start mission|Empezar misión|Lancer la mission|ミッション開始|开始任务
Retry mission|Reintentar misión|Réessayer la mission|ミッション再挑戦|重试任务
Replay mission|Repetir misión|Rejouer la mission|ミッション再プレイ|重玩任务
View missions →|Ver misiones →|Voir les missions →|ミッションを見る →|查看任务 →
Your kaiju|Tu kaiju|Votre kaiju|あなたの怪獣|你的怪兽
24 missions · 6 cities · 72 medal points|24 misiones · 6 ciudades · 72 puntos de medalla|24 missions · 6 villes · 72 points de médaille|24ミッション · 6都市 · メダル72ポイント|24个任务 · 6座城市 · 72奖牌点数
Beat the clock. Earn medals. Unlock all six cities. Your records are shared across kaiju in this player profile.|Vence al reloj, gana medallas y desbloquea las seis ciudades. Este perfil comparte los récords entre kaiju.|Battez le chrono, gagnez des médailles et débloquez les six villes. Les kaiju de ce profil partagent les records.|時間に挑み、メダルを獲得し、全6都市を解放。記録はプロフィール内の怪獣で共有されます。|争分夺秒，赢得奖牌并解锁全部六座城市。此档案中的怪兽共享挑战记录。
Make every second count|Haz que cada segundo cuente|Chaque seconde compte|1秒も無駄にするな|争分夺秒
Earn a medal in all four missions to unlock the next city. Select a mission, then start from the command bar.|Gana una medalla en las cuatro misiones para desbloquear la siguiente ciudad. Elige una misión e iníciala desde la barra inferior.|Gagnez une médaille dans les quatre missions pour débloquer la ville suivante. Sélectionnez une mission, puis lancez-la depuis la barre du bas.|4つすべてのミッションでメダルを獲得すると次の都市を解放。ミッションを選択し、下のボタンで開始。|在全部四个任务中获得奖牌即可解锁下一座城市。选择任务后，使用底部按钮开始。
Demolition Run|Carrera de demolición|Course de démolition|解体ラン|拆除竞速
Military Siege|Asedio militar|Siège militaire|軍事包囲戦|军事围攻
Precision Rampage|Destrucción precisa|Carnage de précision|精密破壊|精准破坏
Power Trial|Prueba de poder|Épreuve de pouvoir|パワートライアル|技能试炼
Destroy every gold-marked target before time runs out. Marked targets have weakened foundations.|Destruye todos los objetivos dorados antes de que se acabe el tiempo. Sus cimientos están debilitados.|Détruisez toutes les cibles dorées avant la fin du temps. Leurs fondations sont fragilisées.|制限時間内に金色の標的をすべて破壊。標的の基礎は弱くなっています。|在时间耗尽前摧毁所有金色标记的目标。标记目标的地基已削弱。
Clear three military assaults, including the boss in the final assault.|Supera tres asaltos militares, incluido el jefe del último asalto.|Repoussez trois assauts militaires, dont le boss du dernier assaut.|最後のボスを含む3回の軍事襲撃を撃退。|击退三次军事进攻，包括最终进攻中的首领。
Destroy the gold-marked landmark while keeping all three green-marked buildings standing. The landmark has weakened foundations.|Destruye el monumento dorado sin derribar los tres edificios verdes. El monumento tiene cimientos debilitados.|Détruisez le monument doré en préservant les trois bâtiments verts. Ses fondations sont fragilisées.|緑色の建物3棟を守り、金色のランドマークを破壊。標的の基礎は弱くなっています。|摧毁金色标记的地标，同时保护全部三个绿色标记的建筑。地标的地基已削弱。
Destroy every gold-marked target using only melee and the listed power. Marked targets have weakened foundations.|Destruye todos los objetivos dorados usando solo ataques cuerpo a cuerpo y el poder indicado. Sus cimientos están debilitados.|Détruisez les cibles dorées avec les attaques de mêlée et le pouvoir indiqué uniquement. Leurs fondations sont fragilisées.|近接攻撃と指定パワーだけで金色の標的をすべて破壊。標的の基礎は弱くなっています。|仅使用近战和指定技能摧毁所有金色标记的目标。标记目标的地基已削弱。
Allowed|Permitido|Autorisé|使用可能|允许使用
Gold|Oro|Or|ゴールド|金牌
Silver|Plata|Argent|シルバー|银牌
Bronze|Bronce|Bronze|ブロンズ|铜牌
Platinum|Platino|Platine|プラチナ|白金
Personal best|Mejor marca|Record personnel|自己ベスト|个人最佳
Best score|Mejor puntuación|Meilleur score|ベストスコア|最佳得分
Attempts|Intentos|Tentatives|挑戦回数|尝试次数
◆ Selected|◆ Seleccionada|◆ Sélectionnée|◆ 選択中|◆ 已选择
Select mission →|Elegir misión →|Choisir une mission →|ミッションを選択 →|选择任务 →
Earn all four medals in the previous cities to unlock|Gana las cuatro medallas anteriores para desbloquear|Gagnez les quatre médailles précédentes pour débloquer|前の都市ですべてのメダルを獲得して解放|获得之前城市的全部四枚奖牌以解锁
Medals and personal bests save to this player profile on this device.|Las medallas y marcas se guardan en este perfil y dispositivo.|Les médailles et records sont enregistrés dans ce profil sur cet appareil.|メダルと自己ベストはこの端末のプロフィールに保存されます。|奖牌和个人最佳记录保存在此设备的玩家档案中。
Storage is unavailable. Progress lasts for this session.|El almacenamiento no está disponible. El progreso dura esta sesión.|Le stockage est indisponible. La progression dure cette session.|保存先を利用できません。進行状況は今回のみ保持されます。|存储不可用，进度仅在本次游戏中保留。
Tour saved on this device. Switch kaiju to continue another career.|Gira guardada en este dispositivo. Cambia de kaiju para continuar otra carrera.|Circuit enregistré sur cet appareil. Changez de kaiju pour poursuivre une autre carrière.|ツアーはこの端末に保存されます。怪獣を切り替えて別の戦績を進められます。|巡回赛已保存在此设备上。切换怪兽可继续其他生涯。
Browser storage is unavailable. Keep this page open to retain your tour.|El almacenamiento no está disponible. Mantén la página abierta para conservar la gira.|Le stockage est indisponible. Gardez cette page ouverte pour conserver le circuit.|保存先を利用できません。ツアーを保持するにはページを開いたままにしてください。|浏览器存储不可用。请保持页面打开以保留巡回赛进度。
The mission did not start. Your medals are safe. Try again.|La misión no empezó. Tus medallas están a salvo. Reinténtalo.|La mission n’a pas démarré. Vos médailles sont conservées. Réessayez.|ミッションを開始できませんでした。メダルは保持されています。再度お試しください。|任务未能开始。奖牌仍然保留，请重试。
The match did not start. Your belts are safe. Try again.|El combate no empezó. Tus cinturones están a salvo. Reinténtalo.|Le combat n’a pas démarré. Vos ceintures sont conservées. Réessayez.|試合を開始できませんでした。ベルトは保持されています。再度お試しください。|比赛未能开始。腰带仍然保留，请重试。
Mission failed|Misión fallida|Mission échouée|ミッション失敗|任务失败
Mission complete|Misión completada|Mission accomplie|ミッション達成|任务完成
Mission time|Tiempo de misión|Durée de mission|ミッション時間|任务时间
Time remaining|Tiempo restante|Temps restant|残り時間|剩余时间
Targets|Objetivos|Cibles|標的|目标
Protected|Protegidos|Protégés|保護対象|保护目标
Assault|Asalto|Assaut|襲撃|进攻
Time expired|Tiempo agotado|Temps écoulé|時間切れ|时间耗尽
Kaiju defeated|Kaiju derrotado|Kaiju vaincu|怪獣撃破|怪兽被击败
Protected building destroyed|Edificio protegido destruido|Bâtiment protégé détruit|保護対象の建物を破壊|受保护建筑已被摧毁
Gold medal|Medalla de oro|Médaille d’or|ゴールドメダル|金牌
Silver medal|Medalla de plata|Médaille d’argent|シルバーメダル|银牌
Bronze medal|Medalla de bronce|Médaille de bronze|ブロンズメダル|铜牌
New personal best|Nueva mejor marca|Nouveau record personnel|自己ベスト更新|新的个人最佳
Medals saved|Medallas guardadas|Médailles enregistrées|メダル保存済み|奖牌已保存
Progress saved|Progreso guardado|Progression enregistrée|進行状況を保存|进度已保存
Session progress only|Progreso solo de sesión|Progression de session uniquement|今回のみの進行状況|仅保留本次进度
No record yet|Sin marca todavía|Aucun record|記録なし|暂无记录
Best|Mejor|Meilleur|ベスト|最佳
City belt won|Cinturón urbano ganado|Ceinture remportée|都市ベルト獲得|获得城市腰带
The tour continues|La gira continúa|Le circuit continue|ツアーは続く|巡回赛继续
Exit tour|Salir de la gira|Quitter le circuit|ツアーを終了|退出巡回赛
Retry tour match|Reintentar combate de gira|Réessayer le combat du circuit|ツアーの試合に再挑戦|重试巡回赛比赛
View champion’s trophy|Ver trofeo del campeón|Voir le trophée du champion|王者のトロフィーを見る|查看冠军奖杯
World title shot|Oportunidad al título mundial|Chance au titre mondial|世界王座に挑戦|挑战世界冠军
Retry this match|Reintentar este combate|Réessayer ce combat|この試合に再挑戦|重试此比赛
Your earned belts are safe|Tus cinturones están a salvo|Vos ceintures sont conservées|獲得済みベルトは保持されます|已获得的腰带仍然保留
Loading failed · Tap start to retry|Error de carga · Pulsa empezar para reintentar|Échec du chargement · Appuyez sur démarrer pour réessayer|読み込み失敗 · 開始ボタンで再試行|加载失败 · 点击开始重试
Initializing|Iniciando|Initialisation|初期化中|初始化中
Loading from cache|Cargando desde caché|Chargement depuis le cache|キャッシュから読み込み中|正在从缓存加载
Downloading assets|Descargando recursos|Téléchargement des ressources|データをダウンロード中|正在下载资源
Warming up shaders|Preparando gráficos|Préparation des graphismes|描画を準備中|正在准备图形
Rehearsing the match|Ensayando el combate|Préparation du combat|試合を準備中|正在准备比赛
The booth takes its seats|Preparando comentaristas|Installation des commentateurs|実況席を準備中|正在准备解说席
Soundcheck|Prueba de sonido|Test sonore|サウンドチェック|声音检查
Warming up rival|Preparando rival|Préparation de l’adversaire|対戦相手を準備中|正在准备对手
The next challenger|El siguiente aspirante|Le prochain challenger|次の挑戦者|下一位挑战者
Kaiju neutralized|Kaiju neutralizado|Kaiju neutralisé|怪獣を制圧|怪兽已被制服
Soldier down|Soldado caído|Soldat à terre|兵士が倒れた|士兵阵亡
The city survives. You held the line.|La ciudad sobrevive. Resististe.|La ville survit. Vous avez tenu bon.|街は守られました。よく持ちこたえました。|城市幸存，你守住了防线。
The Kaiju prevailed. Redeploy and try again.|El kaiju ganó. Despliega y reinténtalo.|Le kaiju a gagné. Redéployez-vous et réessayez.|怪獣が勝利しました。再出撃して挑みましょう。|怪兽获胜。重新出战，再试一次。
The kaiju reigns supreme.|El kaiju reina supremo.|Le kaiju règne en maître.|怪獣が君臨する。|怪兽称霸。
`;
export default rows;
