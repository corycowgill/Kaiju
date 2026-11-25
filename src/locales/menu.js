// English source text | Spanish | French | Japanese | Simplified Chinese.
// Keep interpolation tokens and controller/key glyphs unchanged.
const rows = `
Language|Idioma|Langue|言語|语言
Text language|Idioma del texto|Langue du texte|表示言語|文字语言
Audio remains in English.|El audio permanece en inglés.|L’audio reste en anglais.|音声は英語のままです。|语音仍为英语。
Language saved to this player profile.|Idioma guardado en este perfil.|Langue enregistrée dans ce profil.|このプロフィールに言語を保存しました。|已将语言保存到此玩家档案。
Language changed for this session. Browser storage is unavailable.|Idioma cambiado para esta sesión. El almacenamiento no está disponible.|Langue modifiée pour cette session. Le stockage est indisponible.|このセッションの言語を変更しました。ブラウザーに保存できません。|已更改本次游戏的语言。浏览器存储不可用。
Player profile|Perfil de jugador|Profil du joueur|プレイヤープロフィール|玩家档案
Player profiles|Perfiles de jugador|Profils de joueurs|プレイヤープロフィール|玩家档案
Player profile & history|Perfil e historial|Profil et historique|プロフィールと履歴|玩家档案与历史
Press any button|Pulsa cualquier botón|Appuyez sur une touche|いずれかのボタンを押してください|按任意键
Tap to start|Toca para empezar|Touchez pour commencer|タップして開始|点击开始
Select mode|Elige un modo|Choisir un mode|モード選択|选择模式
Kaiju Havoc|Caos Kaiju|Chaos Kaiju|怪獣ハヴォック|怪兽浩劫
Havoc|Caos|Chaos|大暴れ|浩劫
Title Match|Combate por el título|Combat pour le titre|タイトルマッチ|冠军赛
Wrestling|Lucha libre|Catch|プロレス|摔跤
VS Duel|Duelo VS|Duel VS|怪獣対決|怪兽对决
Kaiju Duel|Duelo Kaiju|Duel Kaiju|怪獣対決|怪兽对决
Lone Soldier|Soldado solitario|Soldat solitaire|一人の兵士|孤胆士兵
First Person|Primera persona|Première personne|一人称視点|第一人称
Main event|Combate estelar|Combat principal|メインイベント|主赛
All 6 cities|Las 6 ciudades|Les 6 villes|全6都市|全部6座城市
Local 2 player|2 jugadores locales|2 joueurs en local|ローカル2人対戦|本地双人
Shared screen|Pantalla compartida|Écran partagé|共有画面|共享屏幕
Championship Tour|Gira de campeonatos|Circuit des champions|チャンピオンシップツアー|冠军巡回赛
City Challenges|Desafíos urbanos|Défis urbains|シティチャレンジ|城市挑战
▶ Watch trailer|▶ Ver tráiler|▶ Voir la bande-annonce|▶ トレーラーを見る|▶ 观看预告片
Model Gallery|Galería de modelos|Galerie des modèles|モデルギャラリー|模型展示
Trophy Room|Sala de trofeos|Salle des trophées|トロフィールーム|奖杯室
Choose your fighter|Elige tu luchador|Choisissez votre combattant|ファイター選択|选择斗士
Choose your kaiju|Elige tu kaiju|Choisissez votre kaiju|怪獣を選択|选择怪兽
Choose your opponent|Elige tu oponente|Choisissez votre adversaire|対戦相手を選択|选择对手
Your opponent|Tu oponente|Votre adversaire|対戦相手|你的对手
Fighters|Luchadores|Combattants|ファイター|斗士
Stage|Escenario|Arène|ステージ|场地
Mode|Modo|Mode|モード|模式
Players|Jugadores|Joueurs|プレイヤー|玩家
Local controls|Controles locales|Commandes locales|ローカル操作|本地操作
Controls|Controles|Commandes|操作方法|操作说明
Both players|Ambos jugadores|Les deux joueurs|両プレイヤー|双方玩家
Player 1|Jugador 1|Joueur 1|プレイヤー1|玩家1
Player 2|Jugador 2|Joueur 2|プレイヤー2|玩家2
Solo|En solitario|Solo|1人プレイ|单人
Solo · vs AI|Solo · contra IA|Solo · contre l’IA|1人 · CPU対戦|单人 · 对战电脑
Local · 2 players|Local · 2 jugadores|Local · 2 joueurs|ローカル · 2人|本地 · 双人
Auto · connected devices|Auto · dispositivos conectados|Auto · appareils connectés|自動 · 接続中の機器|自动 · 已连接的设备
Shared keyboard|Teclado compartido|Clavier partagé|キーボード共有|共享键盘
P1 keyboard + P2 controller|J1 teclado + J2 mando|J1 clavier + J2 manette|P1キーボード＋P2コントローラー|P1键盘＋P2手柄
Two controllers|Dos mandos|Deux manettes|コントローラー2台|两个手柄
AI rival|Rival IA|Adversaire IA|CPU対戦相手|电脑对手
Choose automatically|Elegir automáticamente|Choix automatique|自動で選択|自动选择
Deploy as|Desplegar como|Unité déployée|出撃ユニット|出战单位
Infantry|Infantería|Infanterie|歩兵|步兵
Rifle|Fusil|Fusil|ライフル|步枪
Tank|Tanque|Char|戦車|坦克
Cannon|Cañón|Canon|主砲|火炮
Helicopter|Helicóptero|Hélicoptère|ヘリコプター|直升机
Autocannon|Cañón automático|Canon automatique|機関砲|机炮
Back|Volver|Retour|戻る|返回
Close|Cerrar|Fermer|閉じる|关闭
Unleash Havoc|Desata el caos|Semez le chaos|大暴れを開始|开始破坏
Ring the bell|Que suene la campana|Sonnez la cloche|ゴングを鳴らせ|敲响比赛钟
Fight|Luchar|Combattre|対戦開始|开始战斗
Local wrestling|Lucha libre local|Catch en local|ローカルプロレス|本地摔跤
Local brawl|Pelea local|Bagarre en local|ローカル乱闘|本地乱斗
Deploy|Desplegar|Déployer|出撃|出战
Quality|Calidad|Qualité|画質|画质
Graphics quality|Calidad gráfica|Qualité graphique|画質設定|画质设置
Low|Baja|Faible|低|低
Med|Media|Moyenne|中|中
High|Alta|Élevée|高|高
Presented by|Presentado por|Présenté par|提供|出品
Raze the city wave after wave while the army throws everything it has at you.|Arrasa la ciudad oleada tras oleada mientras el ejército intenta detenerte.|Rasez la ville vague après vague face à toutes les forces de l’armée.|軍の猛攻をしのぎ、ウェーブごとに街を破壊しよう。|抵御军队的全力进攻，一波接一波地摧毁城市。
Best of three falls for the heavyweight belt, in a ring built downtown.|Disputa el cinturón de peso pesado al mejor de tres caídas en un ring urbano.|Disputez la ceinture poids lourds en deux tombés gagnants dans un ring en pleine ville.|街の中央のリングで、2本先取のヘビー級王座戦。|在市中心擂台争夺重量级腰带，三局两胜。
Two kaiju enter, one leaves. Punch, grapple and throw your rival through the streets.|Dos kaiju entran, uno sale. Golpea, agarra y lanza a tu rival por las calles.|Deux kaiju entrent, un seul repart. Frappez, saisissez et projetez votre rival dans les rues.|生き残る怪獣は1体。打撃、組み技、投げでライバルを倒そう。|两只怪兽决战，只有一只能离开。拳击、擒抱并将对手摔向街道。
Two Kaiju Enter, One Kaiju Leaves. Punch, grapple, and throw your rival through the city.|Dos kaiju entran, uno sale. Golpea, agarra y lanza a tu rival por la ciudad.|Deux kaiju entrent, un seul repart. Frappez, saisissez et projetez votre rival dans la ville.|生き残る怪獣は1体。打撃、組み技、投げで街を舞台に戦おう。|两只怪兽决战，只有一只能离开。拳击、擒抱并将对手摔向城市。
Drop in on foot, in a tank or a gunship and bring a kaiju down yourself.|Despliega a pie, en tanque o helicóptero y derriba tú mismo al kaiju.|Déployez-vous à pied, en char ou en hélicoptère pour abattre un kaiju.|歩兵、戦車、ヘリコプターで出撃し、怪獣を倒そう。|以步兵、坦克或武装直升机出战，亲手击败怪兽。
Defend the city against an AI Kaiju. Pick the kaiju you will face, then your unit.|Defiende la ciudad contra un kaiju IA. Elige tu oponente y luego tu unidad.|Défendez la ville contre un kaiju IA. Choisissez l’adversaire, puis votre unité.|CPU怪獣から街を守ろう。対戦する怪獣と出撃ユニットを選択。|抵御电脑怪兽，保卫城市。先选择怪兽对手，再选择出战单位。
P2 plays as a guest. Results save to the active P1 profile; local matches do not advance solo trophies or campaigns. Keyboard or controllers required.|J2 juega como invitado. Los resultados se guardan en el perfil de J1; las partidas locales no avanzan trofeos ni campañas individuales. Se requiere teclado o mandos.|J2 est invité. Les résultats sont enregistrés dans le profil de J1 ; les parties locales ne font pas progresser les trophées ou campagnes solo. Clavier ou manettes requis.|P2はゲストです。結果はP1のプロフィールに保存されます。ローカル対戦では1人用トロフィーやキャンペーンは進みません。キーボードかコントローラーが必要です。|P2为访客。结果保存到P1的当前档案；本地对战不会推进单人奖杯或战役。需要键盘或手柄。
Local brawl: one fall decides it. Fight in the city ring, grapple and pin, or knock your opponent out.|Pelea local: una caída decide el combate. Lucha en el ring urbano, agarra e inmoviliza o noquea a tu rival.|Bagarre locale : un tombé décide du combat. Luttez dans le ring urbain, immobilisez ou mettez votre rival K.-O.|ローカル乱闘は1本勝負。街のリングで組み合い、フォールかKOで勝利。|本地乱斗一局定胜负。在城市擂台战斗，通过擒抱、压制或击倒对手取胜。
Paused|Pausa|Pause|一時停止|已暂停
Resume|Reanudar|Reprendre|再開|继续
Sound|Sonido|Son|サウンド|声音
On|Activado|Activé|オン|开启
Off|Desactivado|Désactivé|オフ|关闭
Quit to menu|Salir al menú|Retour au menu|メニューに戻る|返回菜单
ESC / START TO RESUME|ESC / START PARA REANUDAR|ESC / START POUR REPRENDRE|ESC / STARTで再開|按ESC / START继续
Choose a power|Elige una mejora|Choisir une amélioration|強化を選択|选择强化
Corner advice|Consejo de esquina|Conseils du coin|コーナーの作戦|场边指导
Defeated|Derrotado|Vaincu|敗北|失败
The military has prevailed...|El ejército ha vencido...|L’armée a triomphé...|軍が勝利した…|军队取得了胜利……
Final score|Puntuación final|Score final|最終スコア|最终得分
High score|Récord|Meilleur score|ハイスコア|最高分
New high score|Nuevo récord|Nouveau record|新記録|新纪录
Waves survived|Oleadas superadas|Vagues survécues|生存ウェーブ数|存活波数
Buildings razed|Edificios arrasados|Bâtiments rasés|破壊した建物|摧毁建筑
Military destroyed|Unidades destruidas|Unités détruites|撃破した軍勢|消灭军队
Civilians trampled|Civiles pisoteados|Civils piétinés|踏みつけた市民|踩踏平民
Time survived|Tiempo sobrevivido|Temps de survie|生存時間|存活时间
Defend the title|Defiende el título|Défendre le titre|王座を防衛|卫冕冠军
Next city|Siguiente ciudad|Ville suivante|次の都市|下一座城市
Mission board|Tablón de misiones|Tableau des missions|ミッション一覧|任务面板
Retry / Next|Reintentar / Siguiente|Réessayer / Suivant|再挑戦 / 次へ|重试 / 下一个
Play again|Jugar otra vez|Rejouer|もう一度プレイ|再玩一次
Change fighter|Cambiar luchador|Changer de combattant|ファイター変更|更换斗士
Change fighters|Cambiar luchadores|Changer les combattants|ファイター変更|更换斗士
Retire champion|Retirar al campeón|Retraite du champion|王者として引退|以冠军身份退役
Back to the locker room|Volver al vestuario|Retour aux vestiaires|控室に戻る|返回休息室
Data warning|Aviso de datos|Avertissement de données|データ通信の注意|流量提醒
This game downloads|Este juego descarga|Ce jeu télécharge|初回プレイ時に|首次游玩将下载
of 3D assets on first play.|de recursos 3D la primera vez.|de ressources 3D au premier lancement.|の3Dデータをダウンロードします。|的3D资源。
Assets are cached after the first download. Wi-Fi recommended.|Los recursos se guardan tras la primera descarga. Se recomienda Wi-Fi.|Les ressources sont mises en cache après le premier téléchargement. Wi-Fi conseillé.|初回ダウンロード後はキャッシュに保存されます。Wi-Fiを推奨します。|首次下载后将缓存资源。建议使用Wi-Fi。
Proceed|Continuar|Continuer|続行|继续
Cancel|Cancelar|Annuler|キャンセル|取消
Summoning|Invocando|Invocation|召喚中|召唤中
Loading|Cargando|Chargement|読み込み中|加载中
Loading kaiju assets|Cargando recursos kaiju|Chargement des ressources kaiju|怪獣データ読み込み中|正在加载怪兽资源
Loading gallery…|Cargando galería…|Chargement de la galerie…|ギャラリー読み込み中…|正在加载模型展示……
Auto-rotate|Rotación automática|Rotation automatique|自動回転|自动旋转
Drag to rotate. Scroll or pinch to zoom.|Arrastra para girar. Desplaza o pellizca para acercar.|Glissez pour tourner. Défilez ou pincez pour zoomer.|ドラッグで回転、スクロールかピンチでズーム。|拖动旋转，滚动或双指缩放。
Rotate to landscape|Gira a horizontal|Tournez en mode paysage|画面を横向きにしてください|请横屏游玩
Kaiju Havoc plays sideways: one thumb moves, the other smashes|Juega en horizontal: un pulgar mueve, el otro golpea|Jouez en paysage : un pouce déplace, l’autre frappe|横向きでプレイ：片手で移動、もう片手で攻撃|横屏游玩：一只拇指移动，另一只攻击
Your players. Your kaiju legacy.|Tus jugadores. Tu legado kaiju.|Vos joueurs. Votre légende kaiju.|あなたのプレイヤー、あなたの怪獣伝説。|你的玩家，你的怪兽传奇。
Your trophies, medals, city belts, and records. A separate career for every player on this device.|Tus trofeos, medallas, cinturones y récords. Una carrera para cada jugador de este dispositivo.|Vos trophées, médailles, ceintures et records. Une carrière distincte par joueur sur cet appareil.|トロフィー、メダル、ベルト、記録を、この端末のプレイヤーごとに保存。|在此设备上为每位玩家分别保存奖杯、奖牌、城市腰带和记录。
Choose your player|Elige tu jugador|Choisissez votre joueur|プレイヤー選択|选择玩家
Choose player|Elegir jugador|Choisir un joueur|プレイヤーを選択|选择玩家
Career record|Registro de carrera|Bilan de carrière|戦績|生涯记录
Player name|Nombre del jugador|Nom du joueur|プレイヤー名|玩家名称
Save name|Guardar nombre|Enregistrer le nom|名前を保存|保存名称
Deleting this profile removes its saved career from this browser.|Eliminar este perfil borra su carrera guardada en este navegador.|Supprimer ce profil efface sa carrière de ce navigateur.|このプロフィールを削除すると、ブラウザー内の戦績も削除されます。|删除此档案将移除此浏览器中保存的生涯记录。
Delete profile|Eliminar perfil|Supprimer le profil|プロフィール削除|删除档案
Confirm delete profile|Confirmar eliminación|Confirmer la suppression|削除を確定|确认删除档案
Recent history|Historial reciente|Historique récent|最近の履歴|近期历史
Last 100 results|Últimos 100 resultados|100 derniers résultats|直近100件|最近100场结果
Results recorded since profiles were introduced. Earlier achievements, medals, belts, and high scores are preserved.|Resultados registrados desde la introducción de perfiles. Se conservan los logros, medallas, cinturones y récords anteriores.|Résultats enregistrés depuis l’ajout des profils. Les trophées, médailles, ceintures et records antérieurs sont conservés.|プロフィール導入後の結果を記録します。それ以前のトロフィー、メダル、ベルト、ハイスコアも保持されます。|记录档案功能推出后的比赛结果。此前的成就、奖牌、腰带和最高分仍会保留。
A new kaiju career|Una nueva carrera kaiju|Une nouvelle carrière kaiju|新たな怪獣のキャリア|新的怪兽生涯
Make your mark|Deja tu huella|Laissez votre empreinte|伝説を刻め|留下你的印记
Start fresh with your own achievements, history, high score, challenge medals, and championship belts.|Empieza de cero con tus propios logros, historial, récord, medallas y cinturones.|Repartez de zéro avec vos trophées, historique, record, médailles et ceintures.|自分だけのトロフィー、履歴、ハイスコア、メダル、王座ベルトで新しく始めよう。|从头开始，拥有自己的成就、历史、最高分、挑战奖牌和冠军腰带。
New player name|Nombre del nuevo jugador|Nom du nouveau joueur|新しいプレイヤー名|新玩家名称
Enter a player name|Escribe un nombre de jugador|Saisissez un nom de joueur|プレイヤー名を入力|输入玩家名称
Up to 24 characters|Hasta 24 caracteres|24 caractères maximum|最大24文字|最多24个字符
Saved locally|Guardado localmente|Enregistré localement|端末に保存|本地保存
Up to 8 players|Hasta 8 jugadores|8 joueurs maximum|最大8人|最多8位玩家
Saved in this browser on this device. No account required.|Guardado en este navegador y dispositivo. No necesitas cuenta.|Enregistré dans ce navigateur sur cet appareil. Aucun compte requis.|この端末のブラウザーに保存されます。アカウントは不要です。|保存在此设备的浏览器中，无需账号。
Active player|Jugador activo|Joueur actif|現在のプレイヤー|当前玩家
Your next legend|Tu próxima leyenda|Votre prochaine légende|次の伝説|你的下一段传奇
Local player|Jugador local|Joueur local|ローカルプレイヤー|本地玩家
Playing|Jugando|En jeu|プレイ中|游戏中
New player|Nuevo jugador|Nouveau joueur|新しいプレイヤー|新玩家
Fresh career|Carrera nueva|Nouvelle carrière|新しいキャリア|全新生涯
Career|Carrera|Carrière|戦績|生涯
Player|Jugador|Joueur|プレイヤー|玩家
Active player · Your local legacy|Jugador activo · Tu legado local|Joueur actif · Votre légende locale|現在のプレイヤー · あなたの記録|当前玩家 · 你的本地传奇
Local player · Career preview|Jugador local · Vista de carrera|Joueur local · Aperçu de carrière|ローカルプレイヤー · 戦績プレビュー|本地玩家 · 生涯预览
Local storage is unavailable. This career lasts for this session; profile changes are disabled.|El almacenamiento local no está disponible. La carrera dura esta sesión; no se pueden modificar perfiles.|Le stockage local est indisponible. La carrière dure cette session ; les profils ne peuvent pas être modifiés.|保存先を利用できません。戦績は今回のみ有効で、プロフィールを変更できません。|本地存储不可用。生涯仅在本次游戏中保留，无法修改档案。
Each player keeps a separate career. Switching players reloads the game.|Cada jugador tiene su propia carrera. Cambiar de jugador recarga el juego.|Chaque joueur a sa carrière. Changer de joueur recharge le jeu.|プレイヤーごとに戦績を保存します。切り替えるとゲームを再読み込みします。|每位玩家拥有独立生涯。切换玩家将重新加载游戏。
Finish or quit your current run to switch players. You can still browse careers.|Termina o abandona la partida para cambiar de jugador. Puedes ver las carreras.|Terminez ou quittez la partie pour changer de joueur. Vous pouvez consulter les carrières.|プレイヤーの切り替えはプレイ終了後にできます。戦績は閲覧できます。|结束或退出当前游戏后才能切换玩家。仍可浏览生涯。
Trophies|Trofeos|Trophées|トロフィー|奖杯
Challenge medals|Medallas de desafíos|Médailles de défis|チャレンジメダル|挑战奖牌
City belts|Cinturones urbanos|Ceintures des villes|都市ベルト|城市腰带
Recorded runs|Partidas registradas|Parties enregistrées|記録済みプレイ数|已记录场次
Wins / losses|Victorias / derrotas|Victoires / défaites|勝利 / 敗北|胜利 / 失败
Active play|Tiempo de juego|Temps de jeu|プレイ時間|游玩时间
Won|Victoria|Victoire|勝利|获胜
Lost|Derrota|Défaite|敗北|落败
Left|Abandonada|Abandonnée|途中終了|已退出
Interrupted|Interrumpida|Interrompue|中断|已中断
View career →|Ver carrera →|Voir la carrière →|戦績を見る →|查看生涯 →
Create & play|Crear y jugar|Créer et jouer|作成してプレイ|创建并游玩
Continue as player|Continuar como jugador|Continuer avec ce joueur|このプレイヤーで続行|继续使用此玩家
Play as player|Jugar con este jugador|Jouer avec ce joueur|このプレイヤーでプレイ|使用此玩家游玩
No recorded results yet. Play Havoc, a title match, a challenge, or another mode to start this player’s history.|Aún no hay resultados. Juega para empezar el historial de este jugador.|Aucun résultat. Lancez un mode de jeu pour commencer l’historique de ce joueur.|まだ記録がありません。いずれかのモードをプレイして履歴を作成しましょう。|暂无结果。游玩任意模式即可开始记录此玩家的历史。
Player name saved.|Nombre guardado.|Nom enregistré.|名前を保存しました。|玩家名称已保存。
Profile and its career deleted.|Perfil y carrera eliminados.|Profil et carrière supprimés.|プロフィールと戦績を削除しました。|档案及其生涯记录已删除。
Deleting removes this player’s saved career. Press CONFIRM DELETE PROFILE to continue.|Eliminar borra la carrera de este jugador. Pulsa CONFIRMAR ELIMINACIÓN para continuar.|Cette action efface la carrière du joueur. Appuyez sur CONFIRMER LA SUPPRESSION pour continuer.|削除すると戦績も失われます。「削除を確定」を押して続行してください。|删除将移除此玩家的生涯记录。点击“确认删除档案”以继续。
Enter a player name.|Escribe un nombre de jugador.|Saisissez un nom de joueur.|プレイヤー名を入力してください。|请输入玩家名称。
Up to eight local profiles can be saved.|Puedes guardar hasta ocho perfiles locales.|Vous pouvez enregistrer huit profils locaux maximum.|保存できるローカルプロフィールは8人までです。|最多可保存八个本地档案。
Choose a different player name.|Elige otro nombre de jugador.|Choisissez un autre nom de joueur.|別のプレイヤー名を選んでください。|请选择其他玩家名称。
Could not create a unique player.|No se pudo crear un jugador único.|Impossible de créer un joueur unique.|プレイヤーを作成できませんでした。|无法创建唯一的玩家档案。
Switch to another player before deleting this profile.|Cambia a otro jugador antes de eliminar este perfil.|Changez de joueur avant de supprimer ce profil.|別のプレイヤーに切り替えてから削除してください。|删除此档案前请先切换到其他玩家。
Player no longer exists.|El jugador ya no existe.|Ce joueur n’existe plus.|このプレイヤーは存在しません。|此玩家已不存在。
Finish your run before creating a player.|Termina la partida antes de crear un jugador.|Terminez la partie avant de créer un joueur.|プレイを終了してから作成してください。|请先结束当前游戏，再创建玩家。
Finish your run and ensure local storage is available before switching players.|Termina la partida y comprueba el almacenamiento antes de cambiar de jugador.|Terminez la partie et vérifiez le stockage avant de changer de joueur.|プレイを終了し、保存先を確認してから切り替えてください。|请先结束游戏并确保本地存储可用，再切换玩家。
Progress could not be saved. Free browser storage before switching players.|No se pudo guardar. Libera espacio antes de cambiar de jugador.|Enregistrement impossible. Libérez de l’espace avant de changer de joueur.|保存できませんでした。空き容量を確保してから切り替えてください。|无法保存进度。请释放浏览器存储空间后再切换玩家。
Guest|Invitado|Invité|ゲスト|访客
Local 2P Wrestling|Lucha local de 2J|Catch local à 2|ローカル2人プロレス|本地双人摔跤
Local 2P Brawl|Pelea local de 2J|Bagarre locale à 2|ローカル2人乱闘|本地双人乱斗
City Challenge|Desafío urbano|Défi urbain|シティチャレンジ|城市挑战
Score|Puntuación|Score|スコア|得分
Falls|Caídas|Tombés|フォール|局数
No medal|Sin medalla|Sans médaille|メダルなし|无奖牌
Tokyo|Tokio|Tokyo|東京|东京
Chicago|Chicago|Chicago|シカゴ|芝加哥
Washington DC|Washington D. C.|Washington D.C.|ワシントンDC|华盛顿特区
New York City|Nueva York|New York|ニューヨーク|纽约
New York|Nueva York|New York|ニューヨーク|纽约
Seattle|Seattle|Seattle|シアトル|西雅图
San Francisco|San Francisco|San Francisco|サンフランシスコ|旧金山
DC|DC|DC|DC|华盛顿
NYC|NYC|NYC|NYC|纽约
SF|SF|SF|SF|旧金山
`;
export default rows;
