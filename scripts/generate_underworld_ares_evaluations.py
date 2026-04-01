import json
import math
import os
import re
from copy import deepcopy


BASE_DIR = os.path.join(os.path.dirname(__file__), '..')
DATA_DIR = os.path.join(BASE_DIR, 'data')

EVAL_PATH = os.path.join(DATA_DIR, 'evaluations.json')
CARD_INDEX_PATH = os.path.join(DATA_DIR, 'card_index.json')
NAMES_RU_PATH = os.path.join(DATA_DIR, 'card_names_ru.json')


TAG_BONUS = {
    'Science': 3,
    'Earth': 2,
    'Space': 3,
    'Building': 1,
    'Jovian': 3,
    'Plant': 2,
    'Microbe': 2,
    'Animal': 2,
    'Power': 1,
    'City': 1,
    'Mars': 1,
    'Venus': 1,
    'Crime': 1,
}

TAG_SYNERGIES = {
    'Science': ['Research', 'Mars University', 'Olympus Conference'],
    'Earth': ['Point Luna', 'Earth Office', 'Luna Governor'],
    'Space': ['PhoboLog', 'Space Station', 'Io Mining Industries'],
    'Building': ['Advanced Alloys', 'Electro Catapult', 'Space Elevator'],
    'Jovian': ['Saturn Systems', 'Terraforming Ganymede', 'Titan colony'],
    'Plant': ['EcoLine', 'Kelp Farming', 'Insects'],
    'Microbe': ['Splice', 'Decomposers', 'Viral Enhancers'],
    'Animal': ['Birds', 'Fish', 'Imported Nitrogen'],
    'Power': ['Thorgate', 'Power Infrastructure', 'Standard Technologies'],
    'City': ['Immigrant City', 'Capital', 'Philares'],
    'Crime': ['Jenson-Boyle & Co', 'Racketeering', 'Gas Trust'],
    'Venus': ['Morning Star Inc.', 'Dirigibles', 'Atmospheric Enhancers'],
    'Mars': ['Mars University', 'Terraforming Contract', 'Gordon'],
}

ARES_BASE_MAP = {
    'Capital:ares': ('Capital', 2),
    'Commercial District:ares': ('Commercial District', 2),
    'Deimos Down:ares': ('Deimos Down', 2),
    'Ecological Zone:ares': ('Ecological Zone', 1),
    'Great Dam:ares': ('Great Dam', 1),
    'Industrial Center:ares': ('Industrial Center', 1),
    'Lava Flows:ares': ('Lava Flows', 1),
    'Magnetic Field Generators:ares': ('Magnetic Field Generators', 2),
    'Mining Area:ares': ('Mining Area', 2),
    'Mining Rights:ares': ('Mining Rights', 1),
    'Mohole Area:ares': ('Mohole Area', 1),
    'Natural Preserve:ares': ('Natural Preserve', 1),
    'Nuclear Zone:ares': ('Nuclear Zone', 2),
    'Restricted Area:ares': ('Restricted Area', 1),
}

ARES_OVERRIDES = {
    'Capital:ares': dict(score=68, tier='B', synergies=['Ocean City', 'Lakefront Resorts', 'Artificial Lake'],
                         when='Когда океаны действительно откроются вовремя и есть сильная точка под city/ocean hybrid. В коротких партиях или без хорошего места всё ещё тяжеловата.',
                         econ='26+3=29 MC + минус 2 energy-prod. Взамен получаешь 5 MC-prod, special VP от океанов вокруг и city/ocean tile с Ares-бонусом. Это уже заметно лучше обычной Capital, но всё ещё не ранний auto-pick.',
                         reason='Ares-версия усиливает и темп, и board control: гибридная плитка и placement bonus добавляют реальный upside. Базовый рейтинг уровня C был занижен.'),
    'Commercial District:ares': dict(score=63, tier='C', synergies=['Open City', 'Capital:ares', 'Urbanized Area'],
                                     when='Когда можешь поставить её в плотный кластер и собрать бонусы сразу. Как просто экономическая карта всё ещё посредственная.',
                                     econ='16+3=19 MC + 1 energy-prod. Дает 4 MC-prod, 1-2 VP и Ares tile с бонусом размещения. Это честная situational board-card, а не late-game мусор.',
                                     reason='Ares-версия чуть лучше базы за счёт реального positional upside, но потолок всё равно зависит от карты и уже занятой доски.'),
    'Bioengineering Enclosure': dict(score=65, tier='C', synergies=['Birds', 'Fish', 'Imported Nitrogen'],
                                     when='Когда уже есть animal-карты и нужен защищённый животный хаб. Без animal payoff это просто средняя value-карта.',
                                     econ='13+3=16 MC. Science тег, 2 животных сразу и безопасный перенос животных на более сильные VP-карты.',
                                     reason='В Ares животные и adjacency-бонусы чуть лучше, но сама карта всё равно живёт только внутри animal-пакета. Нормальный engine-enabler, не auto-pick.'),
    'Bio-Fertilizer Facility': dict(score=72, tier='B', synergies=['EcoLine', 'Decomposers', 'Viral Enhancers'],
                                    when='Когда есть microbe/plant board и хочется одновременно поднять plants и усилить бонусы тайла. В чисто быстрых столах чуть слабее.',
                                    econ='14+3=17 MC. +1 plant-prod, до 2 microbes и Ares-tile с бонусом растений/микробов.',
                                    reason='Хорошая гибридная карта: не элитная, но даёт сразу производство, ресурсную настройку и полезную Ares-плитку.'),
    'Butterfly Effect': dict(score=56, tier='C', synergies=['Desperate Measures', 'Marketing Experts'],
                             when='Когда hazard-маркеры уже реально влияют на стол и можно выгодно сдвинуть их под свои планы. Без hazards value низкий.',
                             econ='7+3=10 MC. 1 TR + управление hazard-маркерами в обе стороны.',
                             reason='Карточка сильно зависит от конкретной Ares-доски. В играх без meaningful hazard pressure это просто дороговатый utility-event.'),
    'Desperate Measures': dict(score=48, tier='D', synergies=['Butterfly Effect', 'Marketing Experts'],
                               when='Когда можешь безопасно зафиксировать выгодный hazard и немедленно получить нужный TR. Без hazards почти пустая.',
                               econ='5+3=8 MC. 1 TR и закрепление hazard-токена на нужной линии.',
                               reason='Узкоконтекстная Ares-tech карта. За пределами уже сложившейся hazard-ситуации слишком часто оказывается просто плохим обменом VP на один шаг терраформирования.'),
    'Ecological Survey': dict(score=71, tier='B', synergies=['EcoLine', 'Ecological Zone', 'Biobatteries'],
                              when='Когда зелень уже пошла и ты действительно будешь собирать plant/animal/microbe bonuses с тайлов. В пустой наземной игре хуже.',
                              econ='15+3=18 MC. Тройной теговый payoff на ресурсные adjacency-бонусы по биолинии.',
                              reason='Сильная карта при живой board game и биоресурсах, но требует уже начавшегося ground setup.'),
    'Geological Survey': dict(score=71, tier='B', synergies=['Mining Area:ares', 'Mining Rights:ares', 'Great Dam:ares'],
                              when='Когда планируешь много tile placement и хочешь монетизировать сталь/титан/тепло с клетки. В tile-light руках слабее.',
                              econ='15+3=18 MC. Усиливает металлические и тепловые adjacency-бонусы с размещения плиток.',
                              reason='Один из лучших Ares payoff-энджинов для board/value стратегии; хорош не сам по себе, а в насыщенной тайлами игре.'),
    'Marketing Experts': dict(score=67, tier='B', synergies=['Commercial District:ares', 'Capital:ares', 'Ocean Farm'],
                              when='Когда уже есть несколько своих тайлов с хорошими adjacency bonuses. Рано без board presence карта слишком честная.',
                              econ='8+3=11 MC. +1 MC-prod и маленький rebate при сборе бонусов с собственных тайлов.',
                              reason='Неплохая glue-карта для Ares board engine, но она требует уже построенной инфраструктуры, чтобы стать чем-то больше чем filler.'),
    'Magnetic Field Generators:ares': dict(score=54, tier='C', synergies=['Power Infrastructure', 'Strip Mine', 'Great Dam:ares'],
                                           when='Когда у тебя уже есть избыток энергии и ты реально монетизируешь placement bonus прямо сейчас. В обычной партии всё ещё узкая late-game карта, но уже не мусорный auto-skip.',
                                           econ='20+3=23 MC + тяжёлый минус 4 energy-prod. Взамен получаешь 3 TR, 2 plant-prod и Ares-tile с бонусом 1 plant + 1 microbe. Это заметно лучше базы и уже ближе к честной situational payoff-карте.',
                                           reason='Ares-версия реально лучше обычной: плитка даёт дополнительный immediate value и усиливает board game. Карта всё ещё узкая и требует energy surplus, но оценка уровня F была слишком жёсткой.'),
    'Metallic Asteroid': dict(score=68, tier='C', synergies=['PhoboLog', 'Mining Area:ares', 'Mining Rights:ares'],
                              when='Когда нужен ещё один температурный push и есть план использовать titanium/steel adjacency. Без board leverage просто нормальный event.',
                              econ='11+3=14 MC. +1 temp, 1 titanium, plant hit и металлический adjacency bonus.',
                              reason='В Ares эта версия чуть лучше обычного чистого burn-event, но до топового space payoff всё равно не дотягивает.'),
    'Ocean Farm': dict(score=71, tier='B', synergies=['Lakefront Resorts', 'EcoLine', 'Ocean City'],
                       when='Когда океаны идут быстро и plant/heat production важны. Если наземная игра не складывается, value заметно падает.',
                       econ='16+3=19 MC. +1 heat-prod, +1 plant-prod и ocean overlay tile с plant adjacency.',
                       reason='Хороший средний payoff за океанную линию: не взрывной, но стабильно полезный.'),
    'Ocean Sanctuary': dict(score=69, tier='C', synergies=['Large Convoy', 'Imported Nitrogen', 'Animals'],
                            when='Когда уже есть animal support и океанная игра. Без animal scale это слишком честная поздняя карта.',
                            econ='20+3=23 MC. Ocean overlay, 1 animal сразу и animal adjacency/VP scaling.',
                            reason='Играбельная нишевая карта для animal/ocean билдов, но не универсальный value-pick.'),
    'Solar Farm': dict(score=66, tier='C', synergies=['Power Infrastructure', 'Thorgate', 'EcoLine'],
                       when='Когда поле богато растениями и энергию реально есть куда конвертировать. Без plant density становится слишком средне.',
                       econ='11+3=14 MC. Ares-tile с 2 energy adjacency и variable energy production from area plants.',
                       reason='Хорошая board-specific карта, но слишком зависит от уже сложившейся plant-картины на Марсе.'),
    'Great Dam:ares': dict(score=69, tier='B', synergies=['Physics Complex', 'Steelworks', 'Power Infrastructure'],
                           when='Когда океаны уже близко и энергия действительно нужна. На Ares карте хорошее место под дамбу сильно поднимает value.',
                           econ='12+3=15 MC, payable steel. 2 energy-prod + 1 VP + tile with board value. Для Ares это уже не просто “нормальная Great Dam”, а хороший midgame anchor.',
                           reason='Ares-версия выигрывает от board bonus сильнее, чем сухой base-расчёт показывал. Оставлять её в низком C было слишком консервативно.'),
    'Natural Preserve:ares': dict(score=74, tier='B', synergies=['Mars University', 'Research', 'Olympus Conference'],
                                  when='Когда играешь рано и можешь использовать teleport-like placement плюс science/building теги. После раннего окна заметно хуже.',
                                  econ='9+3=12 MC, steel-payable. 1 VP + 1 MC-prod + 2 сильных тега + Ares placement value. Очень плотная ранняя utility-карта.',
                                  reason='На Ares доске карта становится заметно гибче обычной Natural Preserve и чаще реально окупается уже при розыгрыше.'),
    'Ocean City': dict(score=78, tier='B', synergies=['Capital:ares', 'Lakefront Resorts', 'Ocean Farm'],
                       when='Когда океаны открываются не слишком поздно и ты можешь использовать hybrid ocean/city tile для VP и экономики. В совсем быстрых столах всё ещё может опоздать.',
                       econ='26+3=29 MC. 3 MC-prod, hybrid ocean/city tile и сильный positional upside на Ares board. Потолок выше, чем у обычного позднего города.',
                       reason='Это одна из лучших поздних board-карт Ares, но не auto-A-tier, потому что окно розыгрыша всё ещё завязано на океаны.'),
    'Restricted Area:ares': dict(score=74, tier='B', synergies=['Mars University', 'AI Central', 'Research'],
                                 when='Ранний или средний ген, когда card draw action ещё успеет отработать много раз, а tile placement сейчас полезен. Поздно заметно хуже.',
                                 econ='11+3=14 MC за science tag, tile placement и долгую action на cards. В Ares мгновенный board бонус делает старт карты заметно лучше базы.',
                                 reason='Одна из карт, которая в Ares становится честным engine-enabler, а не просто медленной science-помойкой.'),
}

UNDERWORLD_CORP_OVERRIDES = {
    'Hadesphere': dict(score=73, tier='B', synergies=['Tunneling Operation', 'Tunnel Boring Machine', 'Underground Railway'],
                       when='Когда хочешь стабильно играть через excavation board engine и есть карты, монетизирующие токены. Без follow-up карт просто нормальная корпорация.',
                       econ='40 MC + 5 steel + first action identify 3. Action excavate каждый ген даёт реальный long-game value.',
                       reason='Одна из самых надёжных underworld-корпораций: хороший старт и встроенный доступ к главной механике допа без перекоса в коррупцию.'),
    'Demetron Labs': dict(score=78, tier='B', synergies=['Research', 'Mars University', 'Geological Expertise'],
                          when='Когда стартовая рука и прелюдии поддерживают science-line. Без science density action на data становится слишком медленным.',
                          econ='45 MC + 2 data. На каждом science теге получает ещё data и конвертирует их в identify+claim пакет.',
                          reason='Сильная научная корпорация underworld-формата: не сломанная, но даёт и картовый темп, и доступ к токенам.'),
    'Jenson-Boyle & Co': dict(score=69, tier='C', synergies=['Old World Mafia', 'Racketeering', 'Gas Trust'],
                              when='Когда готов играть через controlled corruption и быстро превращать её в нужный ресурс. Без коррупционных payoff карт легко застрять.',
                              econ='46 MC + 2 corruption. Action меняет 1 corruption на пакет ресурсов по ситуации.',
                              reason='Гибкая, но не бесплатная корпорация: corruption реально надо уметь обслуживать, иначе старт начинает течь.'),
    'Henkei Genetics': dict(score=61, tier='C', synergies=['Splice', 'Decomposers', 'Microbe cards'],
                            when='Только с microbe-heavy рукой или сильными микробными прелюдиями. В generic столе слишком честная.',
                            econ='47 MC + 1 corruption + 2 microbe cards. VP scaling на микробах, но payoff узкий.',
                            reason='Корпорация с понятной нишей и слабой универсальностью; без микробного движка value быстро осыпается.'),
    'Arborist Collective': dict(score=75, tier='B', synergies=['EcoLine', 'Kelp Farming', 'Insects'],
                                when='Когда есть план на ground game и зелень, особенно на картах где plants реально конвертируются в очки. В быстрых space-гонках чуть хуже.',
                                econ='40 MC + 2 plants + 2 plant-prod. Честный сильный растительный старт.',
                                reason='Одна из самых прямолинейно сильных underworld-корпораций: хороший immediate floor и ясный план игры.'),
    'Kingdom of Tauraro': dict(score=58, tier='C', synergies=['Immigrant City', 'Capital', 'Mayor'],
                               when='Когда город и tempo на доске критичны, а ты готов пережить ускорение экономики оппонентов. В engine-heavy столах штраф заметнее.',
                               econ='50 MC + 6 MC-prod + free city, но каждый оппонент тоже получает 2 MC-prod.',
                               reason='Очень swingy корпорация: свой старт сильный, но ты заметно ускоряешь и стол. Это убирает её из верхних тиров.'),
    'Aeron Genomics': dict(score=60, tier='C', synergies=['Birds', 'Fish', 'Large Convoy'],
                           when='Когда стартовая рука поддерживает animal-game. Иначе стартовая сталь и 2 животных не вытягивают корпорацию сами по себе.',
                           econ='35 MC + 5 steel + 2 animals. Animal VP scaling хороший только при реальном animal plan.',
                           reason='Нормальная нишевая animal-корпорация, но не универсальный first-pick.'),
    'Keplertec': dict(score=72, tier='B', synergies=['Io Mining Industries', 'Saturn Systems', 'Titanium Mine'],
                      when='Когда в руке есть space/jovian план и titanium реально конвертируется сразу. Без этого низкий старт становится болезненным.',
                      econ='33 MC + 3 titanium + 1 titanium-prod. Потолок высокий в правильной space-руке.',
                      reason='Классическая space-corp с сильным ceiling и рискованным стартом; в all-expansions формате обычно достаточно материалов, чтобы быть выше среднего.'),
    'Voltagon': dict(score=63, tier='C', synergies=['Thorgate', 'Power Infrastructure', 'Dirigibles'],
                     when='Когда есть power/venus support и ты реально будешь использовать её action. Без питания и floater/venus плана карта средняя.',
                     econ='38 MC + 1 energy-prod. Дополнительная ценность сидит в активной способности, а не в старте.',
                     reason='Рабочая, но не особенно надёжная корпорация: слишком много value спрятано в условном action-движке.'),
    'Anubis Securities': dict(score=81, tier='A', synergies=['Big Asteroid', 'Kelp Farming', 'Strip Mine'],
                              when='Когда в стартовой руке есть мощная карта с жёстким global requirement или ты хочешь агрессивно играть в tempo. Почти всегда сильный выбор.',
                              econ='42 MC + free initial play ignoring requirements. Позже монетизирует низкую corruption и умеет cash out corruption по 6 MC.',
                              reason='Одна из лучших underworld-корпораций: сочетает tempo, деньги и управляемую коррупцию без тяжёлого downside.'),
    'Hecate Speditions': dict(score=68, tier='C', synergies=['Poseidon', 'Trade Fleet', 'Luna colony'],
                              when='Только с Colonies и хорошими колониями. Без колоний или без trade-focused руки value резко падает.',
                              econ='38 MC + extra trade fleet + supply-chain ресурсы. Чисто колониальная корпорация.',
                              reason='В своём столе хороша, но слишком узко завязана на colonу-game, чтобы быть универсально сильной.'),
}

UNDERWORLD_PRELUDE_OVERRIDES = {
    'Free Trade Port': dict(score=69, tier='B', synergies=['Poseidon', 'Trade Fleet', 'Luna colony'],
                            when='Когда Colonies в игре и дополнительная колония действительно сильна. Коррупцию надо быть готовым обслуживать.',
                            econ='1 corruption + colony. В colony-столах это заметный gen1 swing.',
                            reason='Сильная тематическая прелюдия под Colonies: upside высокий, но tied to table setup.'),
    'Investor Plaza': dict(score=69, tier='C', synergies=['Immigrant City', 'Capital', 'Mayor'],
                           when='Когда early city действительно нужен и ты готов играть от board. В engine-only стартах коррупция чувствуется сильнее.',
                           econ='Free city + 1 corruption. Хороший темп, но не бесплатный.',
                           reason='Играбельная, но не премиальная прелюдия: value есть, но коррупция съедает часть выигрыша.'),
    'Inherited Fortune': dict(score=70, tier='B', synergies=['Point Luna', 'Teractor', 'Earth Office'],
                              when='Когда нужен просто сильный и понятный экономический старт. Коррупция терпима, если стол не наказывает её слишком быстро.',
                              econ='10 MC + 1 MC-prod за цену 1 corruption.',
                              reason='Хорошая честная экономика на старте, если не бояться умеренного коррупционного долга.'),
    'Tunneling Operation': dict(score=82, tier='A', synergies=['Hadesphere', 'Tunnel Boring Machine', 'Underground Railway'],
                                when='Почти всегда, когда хочешь играть Underworld по-настоящему. Один из лучших стартовых пакетов на excavation.',
                                econ='Identify 1 + excavate 2 + 2 steel-prod. Очень плотный стартовый пакет.',
                                reason='Сильнейшая utility/economy прелюдия Underworld: и разворачивает механику, и сразу даёт металл-экономику.'),
    'Geological Expertise': dict(score=81, tier='A', synergies=['Demetron Labs', 'Research', 'Olympus Conference'],
                                 when='Когда хочешь early claim quality tokens и science-card quality. Очень сильная универсальная прелюдия.',
                                 econ='Identify 4, claim 1 и добор 2 science-карт. Огромный quality boost gen1.',
                                 reason='Комбинирует доступ к Underworld board и лучший тип card selection, поэтому почти всегда выше среднего.'),
    'Underground Settlement': dict(score=78, tier='B', synergies=['Philares', 'Capital', 'Underground Railway'],
                                   when='Когда ранний город и board control важны. Особенно хороша на картах с жирными бонусами возле выбранного города.',
                                   econ='City + identify adjacent resources + claim 1. Сильный tempo+setup ход.',
                                   reason='Очень качественная board prelude, чуть ниже топа только потому, что больше зависит от карты и размещения.'),
    'Ganymede Trading Company': dict(score=71, tier='B', synergies=['Poseidon', 'Titan colony', 'Trade Fleet'],
                                     when='С Colonies и планом активно торговать. Без такой партии value заметно ниже.',
                                     econ='1 corruption + 3 titanium + trade fleet. Отличный старт под colony/space линию.',
                                     reason='Хорошая специализированная прелюдия: не универсальная, но в правильном формате очень живая.'),
    'Central Reservoir': dict(score=84, tier='A', synergies=['Lakefront Resorts', 'Arctic Algae', 'Kelp Farming'],
                              when='Почти всегда сильна: океан сам по себе хорош, а identify adjacent + claim 2 делает её ещё лучше.',
                              econ='Ocean + identify adjacent + claim 2. Один из лучших underworld tempo starts.',
                              reason='Сочетает сильный базовый эффект океана с полноценным входом в underground economy.'),
    'Battery Shipment': dict(score=71, tier='B', synergies=['Thorgate', 'Power Infrastructure', 'Colonies'],
                             when='Когда энергию есть куда девать сразу или в trade setup. Без payoffs старт остаётся сильным, но менее впечатляющим.',
                             econ='12 energy + 2 energy-prod. Очень жирный power start.',
                             reason='Мощный специализированный энергетический старт, особенно в colonу/ares/power столах.'),
    'Deepwater Dome': dict(score=76, tier='B', synergies=['Lakefront Resorts', 'EcoLine', 'Kelp Farming'],
                           when='Когда ценишь ocean + plant production и хочешь честный универсальный старт.',
                           econ='Ocean + 1 plant-prod. Ничего хитрого, просто хороший пакет.',
                           reason='Стабильная сильная прелюдия без сложных условий.'),
    'Secret Research': dict(score=71, tier='B', synergies=['Research', 'Mars University', 'Point Luna'],
                            when='Когда важна глубина руки и ты готов взять немного коррупции за качество старта.',
                            econ='1 corruption + draw 3 cards. Карточный quality в gen1 заметный.',
                            reason='Нормальная сильная прелюдия для engine-столов, чуть слабее топов из-за коррупционной цены без board effect.'),
    'Prospecting': dict(score=62, tier='C', synergies=['Poseidon', 'Aridor', 'Titan colony'],
                        when='Только с Colonies и когда дополнительная колония действительно worth the spend. В прочих столах узковата.',
                        econ='Заплати 4 MC, добавь новую колонию и сразу поставь туда колонию.',
                        reason='Хороша только в colony-heavy setups; otherwise слишком условная.'),
    'Election Sponsorship': dict(score=68, tier='C', synergies=['Septem Tribus', 'Corridors of Power', 'Rise To Power'],
                                 when='Когда Turmoil реально важен и ты умеешь монетизировать влияние. Без Turmoil почти нечего обсуждать.',
                                 econ='1 corruption + 2 delegates + постоянное +1 influence.',
                                 reason='Сильная тематическая turmoil-прелюдия, но зависимость от конкретного формата очень высокая.'),
    'Cloud Vortex Outpost': dict(score=64, tier='C', synergies=['Morning Star Inc.', 'Dirigibles', 'Floater cards'],
                                 when='Когда уже есть явная Venus/floater линия. Без неё value быстро сползает.',
                                 econ='2 Venus steps + 3 floaters и action-перенос floaters.',
                                 reason='Нишевая прелюдия, которая живёт только внутри venus/floater engine.'),
}

UNDERWORLD_PROJECT_OVERRIDES = {
    'Neutrinograph': dict(score=80, tier='A', synergies=['Research', 'Mars University', 'Olympus Conference'],
                          when='Когда science-движок уже почти собран и ты реально успеваешь конвертировать 3 claimed токена в очки/темп. Без раннего science shell карта слишком поздняя.',
                          econ='14+3=17 MC. 2 VP и identify 7 + claim 3 это очень мощно, но жёсткое требование в 5 science tags двигает карту из auto-pick в high-ceiling payoff.',
                          reason='Очень сильный top-end science payoff Underworld, но не такая универсальная бомба, как это показал сырой first-pass. Требование по 5 science tags реально узкое.'),
    'Microgravimetry': dict(score=73, tier='B', synergies=['Thorgate', 'Power Infrastructure', 'Hadesphere'],
                            when='Когда у тебя есть стабильный запас энергии и время несколько раз активировать карту. В быстрых столах без surplus energy это уже не top-tier.',
                            econ='5+3=8 MC. 1 VP, два сильных тега и action: 2 energy -> identify 3, claim 1.',
                            reason='Очень хорошая utility/action карта, но требует и энергию, и несколько поколений жизни. Сырой first-pass завысил её как будто action бесплатный.'),
    'Stem Field Subsidies': dict(score=72, tier='B', synergies=['Research', 'Demetron Labs', 'Mars University'],
                                 when='Когда science теги реально продолжают идти после розыгрыша карты. Без плотного science shell data-engine не разгоняется достаточно быстро.',
                                 econ='10+3=13 MC. Science тег и data-конвертер в identify/claim action.',
                                 reason='Хорошая engine-карта для science-underworld связки, но ниже, чем казалось first-pass, потому что ей нужно время на накопление данных.'),
    'Off-World Tax Haven': dict(score=76, tier='B', synergies=['Jenson-Boyle & Co', 'Old World Mafia', 'Racketeering'],
                                when='Когда ты уже умеешь дёшево добирать коррупцию и игра не слишком быстрая. Без надёжного доступа к 2 corruption карта может застрять в руке.',
                                econ='8+3=11 MC. +5 MC-prod за -1 VP при требовании 2 corruption — это мощно, но не бесплатно.',
                                reason='Одна из сильнейших corruption payoffs, но всё же не free-roll. В реальных 3P/WGT раздачах она заметно менее универсальна, чем показал первый автоматический проход.'),
}


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def tier_from_score(score):
    if score >= 85:
        return 'S'
    if score >= 75:
        return 'A'
    if score >= 67:
        return 'B'
    if score >= 58:
        return 'C'
    if score >= 48:
        return 'D'
    return 'F'


def clamp(value, low, high):
    return max(low, min(high, value))


def normalize_desc(desc):
    if isinstance(desc, str):
        return desc
    if isinstance(desc, dict):
        parts = []
        for value in desc.values():
            if isinstance(value, str):
                parts.append(value)
        return ' '.join(parts)
    return ''


def parse_num_after(desc, needle):
    match = re.search(rf'{re.escape(needle)}\s+(\d+)', desc, re.IGNORECASE)
    return int(match.group(1)) if match else 0


def parse_prod_steps(desc):
    prod = 0
    patterns = [
        (r'increase your m€ production (\d+) step', 3),
        (r'increase your steel production (\d+) step', 4),
        (r'increase your titanium production (\d+) step', 5),
        (r'increase your plant production (\d+) step', 3),
        (r'increase your energy production (\d+) step', 2),
        (r'increase your heat production (\d+) step', 2),
        (r'decrease your m€ production (\d+) step', -3),
        (r'decrease your energy production (\d+) step', -2),
        (r'decrease your heat production (\d+) step', -2),
    ]
    for pattern, weight in patterns:
        for match in re.finditer(pattern, desc, re.IGNORECASE):
            prod += int(match.group(1)) * weight
    return prod


def base_synergies(tags):
    out = []
    for tag in tags:
        for card in TAG_SYNERGIES.get(tag, []):
            if card not in out:
                out.append(card)
    return out[:3]


def build_entry(score, tier, economy, reasoning, when_to_pick, synergies):
    return {
        'score': int(score),
        'tier': tier,
        'economy': economy,
        'reasoning': reasoning,
        'synergies': synergies[:5],
        'when_to_pick': when_to_pick,
    }


def generate_ares_eval(name, card, evals):
    if name in ARES_OVERRIDES:
        o = ARES_OVERRIDES[name]
        return build_entry(o['score'], o['tier'], o['econ'], o['reason'], o['when'], o['synergies'])

    base_name, delta = ARES_BASE_MAP[name]
    base_eval = evals[base_name]
    score = clamp(base_eval['score'] + delta, 45, 90)
    tier = tier_from_score(score)
    economy = f"{base_eval.get('economy', '')} В Ares эта версия обычно получает ещё немного value с adjacency/hazard pressure.".strip()
    reasoning = f"Ares-версия {base_name} обычно лучше базы за счёт усиленной доски и бонусов размещения. Это не новый архетип, а более board-centric апгрейд уже знакомой карты."
    when = f"{base_eval.get('when_to_pick', '')} В Ares приоритет ещё выше, когда placement bonus действительно можно собрать сейчас.".strip()
    synergies = list(dict.fromkeys((base_eval.get('synergies') or []) + base_synergies(card.get('tags', []))))[:5]
    return build_entry(score, tier, economy, reasoning, when, synergies)


def generate_underworld_project(name, card):
    if name in UNDERWORLD_PROJECT_OVERRIDES:
        o = UNDERWORLD_PROJECT_OVERRIDES[name]
        return build_entry(o['score'], o['tier'], o['econ'], o['reason'], o['when'], o['synergies'])

    desc = normalize_desc(card.get('description', ''))
    tags = card.get('tags', [])
    card_type = card.get('type')
    score = 60 if card_type == 'active' else 58 if card_type == 'automated' else 56
    score += sum(TAG_BONUS.get(tag, 0) for tag in tags)
    score += parse_prod_steps(desc)
    score += parse_num_after(desc, 'identify') * 3
    score += parse_num_after(desc, 'excavate') * 3
    score += parse_num_after(desc, 'claim') * 4
    score += parse_num_after(desc, 'draw') * 2
    score += parse_num_after(desc, 'gain') // 10

    lower = desc.lower()
    if 'place a city' in lower:
        score += 7
    if 'place an ocean' in lower:
        score += 8
    if 'raise venus' in lower:
        score += 4 * parse_num_after(lower, 'raise venus')
    if 'raise the temperature' in lower:
        score += 3 * max(1, parse_num_after(lower, 'raise the temperature'))
    if 'gain 1 tr' in lower:
        score += 3
    if '1 vp' in lower or 'vp per' in lower:
        score += 2
    if 'steal' in lower or 'remove up to' in lower:
        score += 2
    if 'trade fleet' in lower:
        score += 4
    if 'colony' in lower:
        score += 3
    if 'science card' in lower or 'cards with science tags' in lower:
        score += 3
    if 'gain 1 corruption' in lower:
        score -= 5
    if 'gain 2 corruption' in lower:
        score -= 10
    if 'spend 1 corruption' in lower or 'requires 2 corruption' in lower:
        score += 3
    if 'crime' in lower and 'corruption' in lower:
        score += 2
    if not tags:
        score -= 2

    req = (card.get('requirements') or '').lower()
    if req:
        score -= 2
        if 'science' in req or 'city' in req or 'oceans' in req or 'venus' in req:
            score -= 1
        if 'max' in req:
            score -= 1

    score = clamp(score, 40, 84)
    tier = tier_from_score(score)
    economy = f"{card.get('cost', 0)}+3={card.get('cost', 0) + 3} MC. Underworld value идёт через {('identify/excavate' if ('identify' in lower or 'excavate' in lower) else 'коррупцию/теги')}, а не только через голый темп."
    if 'gain 1 corruption' in lower or 'gain 2 corruption' in lower:
        economy += " Учтён штраф за коррупцию."
    reasoning_parts = []
    if 'identify' in lower or 'excavate' in lower or 'claim' in lower:
        reasoning_parts.append('Карта напрямую двигает главную механику Underworld и поэтому имеет floor выше обычного filler.')
    if 'crime' in tags or 'corruption' in lower:
        reasoning_parts.append('Коррупция и crime-пакет в 3P/WGT дают value, но требуют контроля и потому не тянут карту слишком высоко сами по себе.')
    if 'increase your m€ production' in lower or 'increase your steel production' in lower or 'increase your titanium production' in lower:
        reasoning_parts.append('Production всё ещё хороша, но в коротких all-expansions партиях мы не завышаем её как в solitaire-оценках.')
    if not reasoning_parts:
        reasoning_parts.append('Это рабочая underworld-карта средней силы: есть понятный use-case, но без сильного table/context leverage потолок ограничен.')
    when = 'Когда уже есть план на underground tokens и board control.' if ('identify' in lower or 'excavate' in lower or 'claim' in lower) else 'Когда теги и текст карты действительно попадают в твою текущую линию, а не берутся “на будущее”.'
    if 'gain 1 corruption' in lower or 'gain 2 corruption' in lower:
        when += ' Не бери без понимания, чем потом оплачивать коррупцию.'
    synergies = base_synergies(tags)
    if 'identify' in lower or 'excavate' in lower:
        synergies = list(dict.fromkeys(synergies + ['Hadesphere', 'Tunneling Operation', 'Underground Railway']))[:5]
    if 'crime' in tags:
        synergies = list(dict.fromkeys(synergies + ['Jenson-Boyle & Co', 'Racketeering', 'Gas Trust']))[:5]
    return build_entry(score, tier, economy, ' '.join(reasoning_parts), when, synergies)


def main():
    evals = load_json(EVAL_PATH)
    card_index = load_json(CARD_INDEX_PATH)
    names_ru = load_json(NAMES_RU_PATH)

    added = 0

    for name, card in card_index.items():
        module = card.get('module')
        card_type = card.get('type')
        if module not in {'underworld', 'ares'}:
            continue
        if card_type not in {'active', 'automated', 'event', 'corporation', 'prelude'}:
            continue

        if module == 'ares':
            entry = generate_ares_eval(name, card, evals)
        elif card_type == 'corporation':
            o = UNDERWORLD_CORP_OVERRIDES[name]
            entry = build_entry(o['score'], o['tier'], o['econ'], o['reason'], o['when'], o['synergies'])
        elif card_type == 'prelude':
            o = UNDERWORLD_PRELUDE_OVERRIDES[name]
            entry = build_entry(o['score'], o['tier'], o['econ'], o['reason'], o['when'], o['synergies'])
        else:
            entry = generate_underworld_project(name, card)

        if name not in evals:
            added += 1
        evals[name] = {'name': name, **entry}

        if module == 'ares' and name.endswith(':ares'):
            base_name = name.split(':', 1)[0]
            if base_name in names_ru and name not in names_ru:
                names_ru[name] = f"{names_ru[base_name]} (Арес)"

    save_json(EVAL_PATH, evals)
    save_json(NAMES_RU_PATH, names_ru)
    print(f'Generated/updated Underworld+Ares evaluations: {added} new entries')


if __name__ == '__main__':
    main()
