from flask import Blueprint, request, jsonify
from app.database.db import db
from app.models import Token, Transaction, Notification
from flask_jwt_extended import jwt_required, get_jwt_identity

token_bp = Blueprint('tokens', __name__)

@token_bp.route('/balance', methods=['GET'])
@jwt_required()
def get_balance():
    user_id = get_jwt_identity()
    token_account = Token.query.filter_by(user_id=user_id).first()
    
    if not token_account:
        # Auto-create one if missing
        token_account = Token(user_id=user_id, tokens_available=5)
        db.session.add(token_account)
        db.session.commit()

    return jsonify(token_account.to_dict()), 200


@token_bp.route('/purchase', methods=['POST'])
@jwt_required()
def purchase_tokens():
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    
    tokens_to_buy = data.get('tokens', 5)
    amount = data.get('amount', 9.99)  # mock billing amount
    
    if tokens_to_buy <= 0:
        return jsonify({'message': 'Invalid token amount'}), 400

    token_account = Token.query.filter_by(user_id=user_id).first()
    if not token_account:
        token_account = Token(user_id=user_id, tokens_available=0)
        db.session.add(token_account)

    try:
        # Update token balances
        token_account.tokens_available += tokens_to_buy
        token_account.tokens_purchased += tokens_to_buy

        # Create transaction record
        transaction = Transaction(
            user_id=user_id,
            amount=amount,
            tokens_added=tokens_to_buy,
            transaction_type='purchase'
        )
        db.session.add(transaction)

        # Notify user
        notification = Notification(
            user_id=user_id,
            title='Tokens Purchased Successfully!',
            message=f'Your purchase of {tokens_to_buy} tokens for ${amount} was successful. Enjoy your interviews!',
            type='token'
        )
        db.session.add(notification)

        db.session.commit()

        return jsonify({
            'message': f'Successfully purchased {tokens_to_buy} tokens',
            'tokens': token_account.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Purchase transaction failed: {str(e)}'}), 500


@token_bp.route('/transactions', methods=['GET'])
@jwt_required()
def get_transactions():
    user_id = get_jwt_identity()
    transactions = Transaction.query.filter_by(user_id=user_id).order_by(Transaction.created_at.desc()).all()
    return jsonify([t.to_dict() for t in transactions]), 200
