#!/usr/bin/env python3
"""
Generate sprites index with categorization and metadata.
This script analyzes all PNG sprite files and creates sprites.json.
"""

from PIL import Image
import os
import json
from pathlib import Path
import colorsys
import sys


def get_color_name(hex_color):
    """Converte cor hex em nome descritivo"""
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)
    
    h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
    
    if v < 0.2:
        return "preto"
    elif v > 0.9 and s < 0.1:
        return "branco"
    elif s < 0.1:
        return "cinza"
    
    h_deg = h * 360
    if h_deg < 30 or h_deg >= 330:
        return "vermelho"
    elif 30 <= h_deg < 60:
        return "laranja/marrom"
    elif 60 <= h_deg < 90:
        return "amarelo"
    elif 90 <= h_deg < 150:
        return "verde"
    elif 150 <= h_deg < 210:
        return "ciano"
    elif 210 <= h_deg < 270:
        return "azul"
    else:
        return "magenta"


def categorize_sprite(sprite_id, tile_type, cor_dominante):
    """Categoriza sprite e gera descrição"""
    sprite_id_int = int(sprite_id, 16)
    
    categorization = {
        "categoria": None,
        "subcategoria": None,
        "descricao": None,
        "bloqueante": False,
        "altura": 0
    }
    
    if tile_type == "terreno":
        cor_nome = get_color_name(cor_dominante)
        
        if "verde" in cor_nome:
            categorization["categoria"] = "Terreno"
            categorization["subcategoria"] = "Grama"
            categorization["descricao"] = "Grama natural walkable"
            categorization["bloqueante"] = False
        elif "marrom" in cor_nome or "cinza" in cor_nome:
            categorization["categoria"] = "Terreno"
            if sprite_id_int < 0x100:
                categorization["subcategoria"] = "Sujeira/Caminho"
                categorization["descricao"] = "Terra ou caminho walkable"
            else:
                categorization["subcategoria"] = "Pedra/Rocha"
                categorization["descricao"] = "Terreno de pedra walkable"
            categorization["bloqueante"] = False
        elif "azul" in cor_nome:
            categorization["categoria"] = "Água"
            categorization["subcategoria"] = "Água"
            categorization["descricao"] = "Água - bloqueia movimento"
            categorization["bloqueante"] = True
            categorization["altura"] = -5
        else:
            categorization["categoria"] = "Terreno"
            categorization["subcategoria"] = "Variado"
            categorization["descricao"] = "Terreno diverso"
            categorization["bloqueante"] = False
    
    else:  # objetos
        cor_nome = get_color_name(cor_dominante)
        
        if sprite_id_int < 0x100:
            categorization["categoria"] = "Decoração"
            categorization["subcategoria"] = "Floral"
            categorization["descricao"] = "Flora decorativa"
            categorization["bloqueante"] = False
        elif sprite_id_int < 0x200:
            categorization["categoria"] = "Estrutura"
            if "marrom" in cor_nome:
                categorization["subcategoria"] = "Madeira"
                categorization["descricao"] = "Parede/Porta de madeira"
                categorization["altura"] = 20
            else:
                categorization["subcategoria"] = "Pedra"
                categorization["descricao"] = "Parede/Estrutura de pedra"
                categorization["altura"] = 20
            categorization["bloqueante"] = True
        elif sprite_id_int < 0x400:
            categorization["categoria"] = "Móvel/Item"
            categorization["subcategoria"] = "Móvel"
            categorization["descricao"] = "Móvel decorativo ou funcional"
            categorization["bloqueante"] = True
        else:
            categorization["categoria"] = "Objeto"
            categorization["subcategoria"] = "Variado"
            categorization["descricao"] = "Objeto do jogo"
            categorization["bloqueante"] = False
    
    return categorization


def main():
    """Main execution"""
    base_path = Path(__file__).parent.parent
    
    sprites_output = []
    
    # Terreno
    terreno_path = base_path / "public" / "sprites" / "terreno"
    for png_file in sorted(terreno_path.glob("*.png")):
        sprite_id = png_file.stem
        try:
            img = Image.open(png_file)
            width, height = img.size
            
            img_small = img.resize((1, 1), Image.Resampling.LANCZOS)
            pixel = img_small.getpixel((0, 0))
            
            if isinstance(pixel, tuple):
                if len(pixel) == 4:
                    r, g, b, a = pixel
                else:
                    r, g, b = pixel
            else:
                r = g = b = pixel
            
            cor_hex = f"#{r:02x}{g:02x}{b:02x}"
            cat = categorize_sprite(sprite_id, "terreno", cor_hex)
            
            sprites_output.append({
                "id": sprite_id,
                "tipo": "terreno",
                "arquivo": f"terreno/{png_file.name}",
                "largura": width,
                "altura": height,
                "cor_dominante": cor_hex,
                "categoria": cat["categoria"],
                "subcategoria": cat["subcategoria"],
                "descricao": cat["descricao"],
                "bloqueante": cat["bloqueante"],
                "altura_z": cat["altura"]
            })
        except Exception as e:
            print(f"Erro ao processar {sprite_id}: {e}", file=sys.stderr)
    
    # Objetos
    objetos_path = base_path / "public" / "sprites" / "objetos"
    for png_file in sorted(objetos_path.glob("*.png")):
        sprite_id = png_file.stem
        try:
            img = Image.open(png_file)
            width, height = img.size
            
            img_small = img.resize((1, 1), Image.Resampling.LANCZOS)
            pixel = img_small.getpixel((0, 0))
            
            if isinstance(pixel, tuple):
                if len(pixel) == 4:
                    r, g, b, a = pixel
                else:
                    r, g, b = pixel
            else:
                r = g = b = pixel
            
            cor_hex = f"#{r:02x}{g:02x}{b:02x}"
            cat = categorize_sprite(sprite_id, "objeto", cor_hex)
            
            sprites_output.append({
                "id": sprite_id,
                "tipo": "objeto",
                "arquivo": f"objetos/{png_file.name}",
                "largura": width,
                "altura": height,
                "cor_dominante": cor_hex,
                "categoria": cat["categoria"],
                "subcategoria": cat["subcategoria"],
                "descricao": cat["descricao"],
                "bloqueante": cat["bloqueante"],
                "altura_z": cat["altura"]
            })
        except Exception as e:
            print(f"Erro ao processar {sprite_id}: {e}", file=sys.stderr)
    
    # Criar estrutura final
    sprites_index = {
        "versao": 1,
        "origem": "mul:ZuluHotel Brasil OldSkull",
        "data_geracao": "2026-11-05",
        "total_sprites": len(sprites_output),
        "categorias": sorted(list(set(s["categoria"] for s in sprites_output if s["categoria"]))),
        "sprites": sprites_output
    }
    
    # Salvar
    output_path = base_path / "public" / "sprites" / "sprites.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(sprites_index, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Arquivo gerado: {output_path}")
    print(f"📊 Total de sprites: {len(sprites_output)}")
    print(f"\n📋 Categorias encontradas:")
    
    category_counts = {}
    for s in sprites_output:
        cat = s["categoria"]
        category_counts[cat] = category_counts.get(cat, 0) + 1
    
    for cat in sorted(category_counts.keys()):
        print(f"  - {cat}: {category_counts[cat]} sprites")


if __name__ == "__main__":
    main()
