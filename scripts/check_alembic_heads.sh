#!/bin/sh
# Verifica se há múltiplas heads no Alembic antes de permitir o commit.
# Instale como pre-commit hook:
#   cp scripts/check_alembic_heads.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit

HEAD_COUNT=$(cd backend && alembic heads 2>/dev/null | grep -c "(head)")

if [ "$HEAD_COUNT" -gt 1 ]; then
  echo ""
  echo "❌ ERRO: Múltiplas heads Alembic detectadas ($HEAD_COUNT heads)."
  echo ""
  echo "   Crie uma merge revision antes de commitar:"
  echo "   cd backend && alembic merge heads -m \"merge_heads\""
  echo ""
  exit 1
fi

exit 0
