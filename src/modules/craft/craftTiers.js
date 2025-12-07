// ARQUIVO: commands/craftTiers.js

export const CRAFT_TIERS = {
  // Ferramentas
  'pickaxe': ['diamond_pickaxe', 'iron_pickaxe', 'golden_pickaxe', 'stone_pickaxe', 'wooden_pickaxe'],
  'picareta': ['diamond_pickaxe', 'iron_pickaxe', 'golden_pickaxe', 'stone_pickaxe', 'wooden_pickaxe'],
  
  'axe': ['diamond_axe', 'iron_axe', 'golden_axe', 'stone_axe', 'wooden_axe'],
  'machado': ['diamond_axe', 'iron_axe', 'golden_axe', 'stone_axe', 'wooden_axe'],
  
  'sword': ['diamond_sword', 'iron_sword', 'golden_sword', 'stone_sword', 'wooden_sword'],
  'espada': ['diamond_sword', 'iron_sword', 'golden_sword', 'stone_sword', 'wooden_sword'],
  
  'shovel': ['diamond_shovel', 'iron_shovel', 'golden_shovel', 'stone_shovel', 'wooden_shovel'],
  'pá': ['diamond_shovel', 'iron_shovel', 'golden_shovel', 'stone_shovel', 'wooden_shovel'],
  'pa': ['diamond_shovel', 'iron_shovel', 'golden_shovel', 'stone_shovel', 'wooden_shovel'],
  
  'hoe': ['diamond_hoe', 'iron_hoe', 'golden_hoe', 'stone_hoe', 'wooden_hoe'],
  'enxada': ['diamond_hoe', 'iron_hoe', 'golden_hoe', 'stone_hoe', 'wooden_hoe'],

  // Armaduras
  'helmet': ['diamond_helmet', 'iron_helmet', 'golden_helmet', 'leather_helmet'],
  'capacete': ['diamond_helmet', 'iron_helmet', 'golden_helmet', 'leather_helmet'],
  
  'chestplate': ['diamond_chestplate', 'iron_chestplate', 'golden_chestplate', 'leather_chestplate'],
  'peitoral': ['diamond_chestplate', 'iron_chestplate', 'golden_chestplate', 'leather_chestplate'],
  
  'leggings': ['diamond_leggings', 'iron_leggings', 'golden_leggings', 'leather_leggings'],
  'calça': ['diamond_leggings', 'iron_leggings', 'golden_leggings', 'leather_leggings'],
  'calca': ['diamond_leggings', 'iron_leggings', 'golden_leggings', 'leather_leggings'],
  
  'boots': ['diamond_boots', 'iron_boots', 'golden_boots', 'leather_boots'],
  'botas': ['diamond_boots', 'iron_boots', 'golden_boots', 'leather_boots']
}

export const ORE_ALIASES = {
    'ferro': ['iron_ore', 'deepslate_iron_ore', 'raw_iron_block'],
    'iron': ['iron_ore', 'deepslate_iron_ore', 'raw_iron_block'],
    
    'carvao': ['coal_ore', 'deepslate_coal_ore', 'coal_block'],
    'coal': ['coal_ore', 'deepslate_coal_ore', 'coal_block'],
    
    'diamante': ['diamond_ore', 'deepslate_diamond_ore'],
    'diamond': ['diamond_ore', 'deepslate_diamond_ore'],
    
    'ouro': ['gold_ore', 'deepslate_gold_ore', 'nether_gold_ore'],
    'gold': ['gold_ore', 'deepslate_gold_ore', 'nether_gold_ore'],
    
    'cobre': ['copper_ore', 'deepslate_copper_ore'],
    'copper': ['copper_ore', 'deepslate_copper_ore'],
    
    'lapis': ['lapis_ore', 'deepslate_lapis_ore'],
    'redstone': ['redstone_ore', 'deepslate_redstone_ore'],
    'esmeralda': ['emerald_ore', 'deepslate_emerald_ore'],
    
    'pedra': ['stone', 'cobblestone', 'deepslate', 'diorite', 'andesite', 'granite'] 
}

export const ITEM_GROUPS = {
  madeira: [
    '_log', '_planks', '_wood', '_stem', '_hyphae', 'stick', 'sapling', 
    'door', 'fence', 'gate', 'trapdoor', 'pressure_plate', 'button', 'sign', 'boat'
  ],
  pedra: [
    'cobblestone', 'stone', 'andesite', 'diorite', 'granite', 'tuff', 'deepslate', 
    'brick', 'polished_', 'calcite', 'dripstone', 'basalt', 'smooth_'
  ],
  minerios: [
    'raw_', '_ingot', 'diamond', 'emerald', 'coal', 'lapis', 'redstone', 'quartz', 
    'gold_nugget', 'iron_nugget', 'copper_', 'amethyst', 'netherite_'
  ],
  ferramentas: [
    '_pickaxe', '_axe', '_shovel', '_hoe', '_sword', 'bow', 'crossbow', 'trident', 
    'shield', 'arrow', 'fishing_rod', 'flint_and_steel', 'shears', 'spyglass'
  ],
  armaduras: [
    '_helmet', '_chestplate', '_leggings', '_boots', 'elytra', 'turtle_helmet'
  ],
  comida: [
    'beef', 'porkchop', 'chicken', 'cod', 'salmon', 'mutton', 'rabbit', 'bread', 
    'apple', 'carrot', 'potato', 'wheat', 'melon', 'pumpkin_pie', 'cookie', 
    'berries', 'stew', 'soup', 'cake', 'honey'
  ],
  drops: [
    'rotten_flesh', 'bone', 'string', 'spider_eye', 'gunpowder', 'ender_pearl', 
    'slime_ball', 'magma_cream', 'blaze_', 'ghast_tear', 'phantom_membrane', 
    'feather', 'leather', 'ink_sac', 'scute', 'egg'
  ],
  natureza: [
    'dirt', 'grass_block', 'sand', 'gravel', 'clay', 'mud', 'snow', 'ice', 
    'leaves', 'vine', 'lily_pad', 'cactus', 'sugar_cane', 'bamboo', 'kelp', 
    'flower', 'tulip', 'orchid', 'rose', 'dandelion', 'poppy', 'mushroom', 
    'moss', 'fern', 'seed'
  ],
  redstone: [
    'redstone', 'repeater', 'comparator', 'piston', 'observer', 'dropper', 
    'dispenser', 'hopper', 'lever', 'tripwire', 'daylight_detector', 'lamp', 
    'note_block', 'jukebox', 'tnt', 'rail', 'minecart'
  ],
  nether: [
    'netherrack', 'soul_', 'quartz_block', 'nether_brick', 'glowstone', 
    'shroomlight', 'crimson_', 'warped_', 'nether_wart'
  ],
  end: [
    'end_stone', 'purpur', 'chorus', 'shulker', 'dragon_'
  ],
  construcao: [
    'glass', 'concrete', 'terracotta', 'wool', 'carpet', 'bed', 'torch', 
    'lantern', 'ladder', 'scaffolding', 'bucket'
  ]
}