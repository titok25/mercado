#!/bin/bash

# Script para instalar as otimizações de performance

echo "=========================================="
echo "Instalando Otimizações de Performance"
echo "=========================================="

# Backup dos arquivos originais
echo "1. Fazendo backup dos arquivos originais..."
cp server.js server.js.bak
cp checkout/checkout.js checkout/checkout.js.bak
cp api/create-pix.js api/create-pix.js.bak

# Instalar versões otimizadas
echo "2. Instalando versões otimizadas..."
cp server-optimized.js server.js
cp checkout/checkout-optimized.js checkout/checkout.js
cp api/create-pix-optimized.js api/create-pix.js

echo "3. Verificando instalação..."
if grep -q "Cache-Control" server.js; then
  echo "✓ server.js otimizado com sucesso"
else
  echo "✗ Erro ao otimizar server.js"
  exit 1
fi

if grep -q "_cachedState" checkout/checkout.js; then
  echo "✓ checkout.js otimizado com sucesso"
else
  echo "✗ Erro ao otimizar checkout.js"
  exit 1
fi

if grep -q "AbortController" api/create-pix.js; then
  echo "✓ create-pix.js otimizado com sucesso"
else
  echo "✗ Erro ao otimizar create-pix.js"
  exit 1
fi

echo ""
echo "=========================================="
echo "Otimizações instaladas com sucesso!"
echo "=========================================="
echo ""
echo "Backups salvos em:"
echo "  - server.js.bak"
echo "  - checkout/checkout.js.bak"
echo "  - api/create-pix.js.bak"
echo ""
echo "Próximos passos:"
echo "  1. Testar localmente: npm start"
echo "  2. Fazer commit: git add . && git commit -m 'Otimizações de performance'"
echo "  3. Deploy: git push"
echo ""
