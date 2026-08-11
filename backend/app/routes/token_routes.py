from fastapi import APIRouter, Body, HTTPException, status, Depends
from app.database.db import db
from app.models import Token, Transaction, Notification
from app.utils.security import get_current_user_id

token_bp = APIRouter()

@token_bp.get('/balance')
def get_balance(user_id: int = Depends(get_current_user_id)):
    token_account = Token.query.filter_by(user_id=user_id).first()
    
    if not token_account:
        token_account = Token(user_id=user_id, tokens_available=5)
        db.session.add(token_account)
        db.session.commit()

    return token_account.to_dict()

@token_bp.post('/purchase')
def purchase_tokens(payload: dict = Body(default=None), user_id: int = Depends(get_current_user_id)):
    data = payload or {}
    
    tokens_to_buy = data.get('tokens', 5)
    amount = data.get('amount', 9.99)
    
    if tokens_to_buy <= 0:
        raise HTTPException(status_code=400, detail="Invalid token amount")

    token_account = Token.query.filter_by(user_id=user_id).first()
    if not token_account:
        token_account = Token(user_id=user_id, tokens_available=0)
        db.session.add(token_account)

    try:
        token_account.tokens_available += tokens_to_buy
        token_account.tokens_purchased += tokens_to_buy

        transaction = Transaction(
            user_id=user_id,
            amount=amount,
            tokens_added=tokens_to_buy,
            transaction_type='purchase'
        )
        db.session.add(transaction)

        notification = Notification(
            user_id=user_id,
            title='Tokens Purchased Successfully!',
            message=f'Your purchase of {tokens_to_buy} tokens for ${amount} was successful. Enjoy your interviews!',
            type='token'
        )
        db.session.add(notification)

        db.session.commit()

        return {
            'message': f'Successfully purchased {tokens_to_buy} tokens',
            'tokens': token_account.to_dict()
        }

    except Exception as e:
        db.session.rollback()
        raise HTTPException(status_code=500, detail=f"Purchase transaction failed: {str(e)}")

@token_bp.get('/transactions')
def get_transactions(user_id: int = Depends(get_current_user_id)):
    transactions = Transaction.query.filter_by(user_id=user_id).order_by(Transaction.created_at.desc()).all()
    return [t.to_dict() for t in transactions]
