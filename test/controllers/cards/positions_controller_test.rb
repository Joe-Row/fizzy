require "test_helper"

class Cards::PositionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as :kevin
  end

  test "create moves a card before another in the same column" do
    board = boards(:writebook)
    column = columns(:writebook_triage)
    first = Card.create!(title: "First", board: board, creator: users(:kevin), column: column, status: :published)
    second = Card.create!(title: "Second", board: board, creator: users(:kevin), column: column, status: :published)

    post card_position_path(second), params: { before_id: first.number }

    assert_response :no_content
    assert_equal [ second, first ], board.cards.where(id: [ first.id, second.id ]).ranked.to_a
  end
end
