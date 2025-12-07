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